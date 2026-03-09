import os
import json
import logging
import ssl
import socket
import urllib.parse
from typing import List, Dict, Optional

import dns.resolver
import redis
from bs4 import BeautifulSoup

from utils.safe_request import get as safe_get
from utils.url_validator import (
    ExternalTargetNotAllowedError,
    URLValidationError,
    validate_url_for_request,
)

"""
Python worker for Lumen.

This process listens for scan jobs on Redis, runs a set of HTTP-focused
security checks against the target, and publishes the findings back to the
Node.js backend over Redis pub/sub.

The goal is to keep each scan small and understandable so you can see
exactly what is happening and extend it later if needed.
"""

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
# Only allow external/public scans when explicitly enabled.
ALLOW_EXTERNAL = os.getenv("ALLOW_EXTERNAL", "false").lower() in ("1", "true", "yes")

# Whether private targets (RFC1918, ULA) are allowed. Default: false.
# Set true only for self-hosted deployments that intentionally scan internal networks.
ALLOW_PRIVATE_TARGETS = os.getenv("ALLOW_PRIVATE_TARGETS", "false").lower() in ("1", "true", "yes")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())

JOB_CHANNEL = "scan_jobs"
RESULT_CHANNEL = "scan_results"

redis_client = redis.Redis.from_url(REDIS_URL)


def send_results(scan_id: str, issues: List[Dict]) -> None:
    """Publish the list of issues for a given scan back to Redis."""
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "results": issues}),
    )


# --- Individual scan functions -------------------------------------------------


def check_tls(hostname: str, port: int = 443) -> List[Dict]:
    """
    Open a TLS connection to the host and look for obvious SSL/TLS problems.
    """
    issues: List[Dict] = []
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED

        with socket.create_connection((hostname, port), timeout=8) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                if not cert:
                    issues.append(
                        {
                            "title": "Missing SSL certificate",
                            "severity": "high",
                            "description": "No SSL certificate was presented by the server.",
                            "category": "ssl",
                        }
                    )
                proto = ssock.version()
                if proto and "TLSv1" in proto:
                    issues.append(
                        {
                            "title": f"Weak TLS protocol in use ({proto})",
                            "severity": "medium",
                            "description": "The server negotiated an older TLS version.",
                            "category": "ssl",
                        }
                    )
    except Exception as e:
        issues.append(
            {
                "title": "SSL/TLS handshake error",
                "severity": "medium",
                "description": str(e),
                "category": "ssl",
            }
        )
    return issues


def check_http_headers(url: str) -> List[Dict]:
    """
    Inspect HTTP response headers for missing security headers.
    """
    issues: List[Dict] = []
    try:
        resp = safe_get(url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        required = [
            ("Content-Security-Policy", "high"),
            ("X-Frame-Options", "medium"),
            ("X-Content-Type-Options", "medium"),
            ("Referrer-Policy", "low"),
            ("Strict-Transport-Security", "high"),
        ]
        for header_name, severity in required:
            if header_name not in resp.headers:
                issues.append(
                    {
                        "title": f"Missing security header: {header_name}",
                        "severity": severity,
                        "description": f"The response does not include {header_name}.",
                        "category": "headers",
                        "evidence": f"Status {resp.status_code}, headers: {dict(resp.headers)}",
                    }
                )
    except Exception as e:
        issues.append(
            {
                "title": "HTTP header scan error",
                "severity": "low",
                "description": str(e),
                "category": "headers",
            }
        )
    return issues


def check_xss(url: str) -> List[Dict]:
    """
    Try to reflect a harmless script payload via query parameters.
    """
    issues: List[Dict] = []
    payload = "<script>alert(1)</script>"
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["x"] = [payload]
        new_qs = urllib.parse.urlencode(qs, doseq=True)
        test_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))

        resp = safe_get(test_url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        if payload in resp.text:
            issues.append(
                {
                    "title": "Reflected XSS",
                    "severity": "high",
                    "description": "A script payload was reflected in the response, indicating possible XSS.",
                    "evidence": f"URL: {test_url}",
                    "category": "xss",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "XSS scan error",
                "severity": "low",
                "description": str(e),
                "category": "xss",
            }
        )
    return issues


def check_sql_injection(url: str) -> List[Dict]:
    """
    Inject a simple SQL-flavoured payload into all query parameters and look
    for SQL error messages in the response.
    """
    issues: List[Dict] = []
    payload = "' OR '1'='1"
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        for key in qs.keys():
            qs[key] = [payload]
        new_qs = urllib.parse.urlencode(qs, doseq=True)
        test_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))

        resp = safe_get(test_url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        soup = BeautifulSoup(resp.text, "lxml")
        text = soup.text.lower()
        if "sql" in text or "syntax" in text:
            issues.append(
                {
                    "title": "Potential SQL injection",
                    "severity": "high",
                    "description": "The response contains what looks like a SQL error message.",
                    "evidence": f"URL: {test_url}",
                    "category": "sqli",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "SQL injection scan error",
                "severity": "low",
                "description": str(e),
                "category": "sqli",
            }
        )
    return issues


def check_directory_traversal(url: str) -> List[Dict]:
    """
    Try to access /etc/passwd-style content via a file parameter.
    """
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["file"] = ["../../../../etc/passwd"]
        test_url = urllib.parse.urlunparse(
            parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
        )
        resp = safe_get(test_url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        if "root:x:" in resp.text:
            issues.append(
                {
                    "title": "Directory traversal",
                    "severity": "critical",
                    "description": "Sensitive file content appeared in the response.",
                    "evidence": "Detected /etc/passwd-style output in the response.",
                    "category": "traversal",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "Traversal scan error",
                "severity": "low",
                "description": str(e),
                "category": "traversal",
            }
        )
    return issues


def discover_subdomains(hostname: str) -> List[Dict]:
    """
    Resolve a small set of common subdomains for the target host.
    """
    issues: List[Dict] = []
    try:
        common = ["www", "api", "dev", "staging", "test", "mail"]
        for sub in common:
            fqdn = f"{sub}.{hostname}"
            try:
                answers = dns.resolver.resolve(fqdn, "A")
                ips = [answer.to_text() for answer in answers]
                issues.append(
                    {
                        "title": f"Subdomain found: {fqdn}",
                        "severity": "low",
                        "description": f"{fqdn} resolves to {', '.join(ips)}",
                        "category": "subdomain",
                    }
                )
            except Exception:
                # Many of these will simply not resolve; that's fine.
                continue
    except Exception as e:
        issues.append(
            {
                "title": "Subdomain enumeration error",
                "severity": "low",
                "description": str(e),
                "category": "subdomain",
            }
        )
    return issues


def check_cookie_flags(url: str) -> List[Dict]:
    """
    Inspect Set-Cookie headers for missing security flags on session cookies.
    """
    issues: List[Dict] = []
    try:
        resp = safe_get(url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        set_cookie = resp.headers.get("Set-Cookie")
        if not set_cookie:
            return issues

        header = set_cookie.lower()
        # This is a simple heuristic, not a full cookie parser.
        if "httponly" not in header or "secure" not in header:
            issues.append(
                {
                    "title": "Session cookies missing security flags",
                    "severity": "medium",
                    "description": "Set-Cookie headers do not include both HttpOnly and Secure flags.",
                    "evidence": f"Set-Cookie: {set_cookie}",
                    "category": "cookies",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "Cookie flag scan error",
                "severity": "low",
                "description": str(e),
                "category": "cookies",
            }
        )
    return issues


def check_error_leakage(url: str) -> List[Dict]:
    """
    Try to trigger verbose error messages or stack traces with a harmless probe.
    """
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["lumen_error_probe"] = ["1"]
        test_url = urllib.parse.urlunparse(
            parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
        )
        resp = safe_get(test_url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        text = resp.text

        if resp.status_code >= 500 or any(
            marker in text for marker in ["Exception", "Traceback", "Error:"]
        ):
            issues.append(
                {
                    "title": "Verbose error or stack trace exposed",
                    "severity": "medium",
                    "description": "The application exposed a detailed error message or stack trace.",
                    "evidence": f"Status {resp.status_code} on {test_url}",
                    "category": "error",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "Error leakage scan error",
                "severity": "low",
                "description": str(e),
                "category": "error",
            }
        )
    return issues


def check_broken_access_control(url: str) -> List[Dict]:
    """
    Perform a very small IDOR-style probe by bumping a numeric ID in the path.
    This is heuristic and reports a potential issue only.
    """
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.rstrip("/")
        parts = path.split("/")
        if len(parts) < 2:
            return issues

        last = parts[-1]
        if not last.isdigit():
            return issues

        base_id = int(last)
        other_id = base_id + 1
        path_original = "/".join(parts)
        path_other = "/".join(parts[:-1] + [str(other_id)])

        url1 = urllib.parse.urlunparse(parsed._replace(path=path_original))
        url2 = urllib.parse.urlunparse(parsed._replace(path=path_other))

        resp1 = safe_get(url1, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)
        resp2 = safe_get(url2, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=10, allow_redirects=True)

        if resp1.status_code == 200 and resp2.status_code == 200 and resp1.text != resp2.text:
            issues.append(
                {
                    "title": "Potential broken access control (IDOR)",
                    "severity": "medium",
                    "description": "Changing a numeric ID in the URL returned a different resource without extra checks.",
                    "evidence": f"Tried {url1} and {url2}",
                    "category": "access_control",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "Access control scan error",
                "severity": "low",
                "description": str(e),
                "category": "access_control",
            }
        )
    return issues


def check_rate_limiting(url: str) -> List[Dict]:
    """
    Send a few quick requests and look for any sign of rate limiting such as
    HTTP 429 or a Retry-After header. If none is observed, report this as a
    low-severity hint rather than a confirmed vulnerability.
    """
    issues: List[Dict] = []
    try:
        responses = []
        for _ in range(5):
            resp = safe_get(url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS, timeout=5, allow_redirects=True)
            responses.append(resp)

        limited = any(
            r.status_code == 429
            or "retry-after" in (k.lower() for k in r.headers.keys())
            or "too many requests" in r.text.lower()
            for r in responses
        )

        if not limited:
            issues.append(
                {
                    "title": "No obvious rate limiting observed",
                    "severity": "low",
                    "description": "Repeated requests did not show any sign of rate limiting on this endpoint.",
                    "category": "rate_limit",
                }
            )
    except Exception as e:
        issues.append(
            {
                "title": "Rate limiting scan error",
                "severity": "low",
                "description": str(e),
                "category": "rate_limit",
            }
        )
    return issues


# --- Orchestration -------------------------------------------------------------


def run_scan(target_url: str, profile: Optional[List[str]] = None) -> List[Dict]:
    """
    Run the selected scan modules against the target URL.

    If profile is None, all scans are executed. If profile is a list of names
    (e.g. ['xss', 'sqli']), only those scans are run.
    """
    issues: List[Dict] = []

    parsed = urllib.parse.urlparse(target_url)
    hostname = parsed.hostname

    if not hostname:
        issues.append(
            {
                "title": "Invalid target",
                "severity": "low",
                "description": f"Could not extract a hostname from {target_url}.",
                "category": "network",
            }
        )
        return issues

    try:
        validate_url_for_request(target_url, allow_external=ALLOW_EXTERNAL, allow_private=ALLOW_PRIVATE_TARGETS)
    except ExternalTargetNotAllowedError as e:
        issues.append(
            {
                "title": "External scans disabled",
                "severity": "low",
                "description": f"Scanning external host {hostname} is disabled in the worker configuration.",
                "category": "policy",
            }
        )
        return issues
    except URLValidationError as e:
        description = str(e)
        if description.startswith("DNS resolution failed"):
            issues.append(
                {
                    "title": "DNS resolution failed",
                    "severity": "low",
                    "description": description,
                    "category": "network",
                }
            )
            return issues

        issues.append(
            {
                "title": "Target blocked",
                "severity": "low",
                "description": description,
                "category": "policy",
            }
        )
        return issues

    def want(name: str) -> bool:
        return profile is None or name in profile

    # 10 individual scan modules
    if want("tls"):
        issues += check_tls(hostname)
    if want("headers"):
        issues += check_http_headers(target_url)
    if want("xss"):
        issues += check_xss(target_url)
    if want("sqli"):
        issues += check_sql_injection(target_url)
    if want("traversal"):
        issues += check_directory_traversal(target_url)
    if want("subdomain"):
        issues += discover_subdomains(hostname)
    if want("cookies"):
        issues += check_cookie_flags(target_url)
    if want("error"):
        issues += check_error_leakage(target_url)
    if want("access_control"):
        issues += check_broken_access_control(target_url)
    if want("rate_limit"):
        issues += check_rate_limiting(target_url)

    return issues


# --- Entry point ---------------------------------------------------------------


def main() -> None:
    pubsub = redis_client.pubsub()
    pubsub.subscribe(JOB_CHANNEL)
    print("Python worker is running and waiting for scan jobs...")

    for message in pubsub.listen():
        if message.get("type") != "message":
            continue

        payload = None
        try:
            payload = json.loads(message["data"])
            scan_id = payload.get("scanId")
            target_url = payload.get("targetUrl")
            profile = payload.get("scanProfile")  # optional list of scan names

            if not target_url:
                print("Received job without a targetUrl, skipping.")
                continue

            print(f"Processing scan {scan_id} for {target_url}")
            issues = run_scan(target_url, profile)
            send_results(scan_id, issues)
        except Exception as e:
            print(f"Worker error while handling message: {e}")
            scan_id = payload.get("scanId", "unknown") if isinstance(payload, dict) else "unknown"
            send_results(
                scan_id,
                [
                    {
                        "title": "Worker error",
                        "severity": "low",
                        "description": str(e),
                        "category": "general",
                    }
                ],
            )


if __name__ == "__main__":
    main()