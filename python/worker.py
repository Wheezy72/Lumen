import os
import json
import ssl
import socket
import threading
import urllib.parse
from typing import List, Dict, Optional

import dns.resolver
import redis
import requests
from bs4 import BeautifulSoup

"""
Python worker for the scanner.

This process listens for scan jobs on Redis, runs a set of HTTP-focused
checks against the site, and publishes the findings back to the Node.js backend.
"""

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

JOB_CHANNEL = "scan_jobs"
RESULT_CHANNEL = "scan_results"

HEARTBEAT_KEY = os.getenv("PY_WORKER_HEARTBEAT_KEY", "scanner:python_worker:heartbeat")
HEARTBEAT_TTL_SECONDS = int(os.getenv("PY_WORKER_HEARTBEAT_TTL_SECONDS", "15"))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("PY_WORKER_HEARTBEAT_INTERVAL_SECONDS", "5"))

redis_client = redis.Redis.from_url(REDIS_URL)


def send_results(scan_id: str, issues: List[Dict]) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "results": issues}),
    )


def send_progress(scan_id: str, progress: int) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "type": "progress", "progress": progress}),
    )


def send_error(scan_id: str, error: str) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "type": "error", "error": error}),
    )


def heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            redis_client.set(HEARTBEAT_KEY, "1", ex=HEARTBEAT_TTL_SECONDS)
        except Exception as e:
            print(f"Heartbeat error: {e}")
        stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)


# --- Individual scan functions -------------------------------------------------


def check_tls(hostname: str, port: int = 443) -> List[Dict]:
    """Open a TLS connection to the host and look for obvious SSL/TLS problems."""
    issues: List[Dict] = []
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED

        with socket.create_connection((hostname, port), timeout=8) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                if not cert:
                    issues.append({
                        "title": "Missing SSL certificate",
                        "severity": "high",
                        "description": "No SSL certificate was presented by the server.",
                        "category": "ssl",
                    })
                proto = ssock.version()
                if proto and "TLSv1" in proto:
                    issues.append({
                        "title": f"Weak TLS protocol in use ({proto})",
                        "severity": "medium",
                        "description": "The server negotiated an older TLS version.",
                        "category": "ssl",
                    })
    except Exception as e:
        issues.append({
            "title": "SSL/TLS handshake error",
            "severity": "medium",
            "description": str(e),
            "category": "ssl",
        })
    return issues


def check_http_headers(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Inspect HTTP response headers for missing security headers."""
    issues: List[Dict] = []
    try:
        resp = requests.get(url, timeout=10, headers=headers)
        required = [
            ("Content-Security-Policy", "high"),
            ("X-Frame-Options", "medium"),
            ("X-Content-Type-Options", "medium"),
            ("Referrer-Policy", "low"),
            ("Strict-Transport-Security", "high"),
        ]
        for header_name, severity in required:
            if header_name not in resp.headers:
                issues.append({
                    "title": f"Missing security header: {header_name}",
                    "severity": severity,
                    "description": f"The response does not include {header_name}.",
                    "category": "headers",
                    "evidence": f"Status {resp.status_code}, headers: {dict(resp.headers)}",
                })
    except Exception as e:
        issues.append({
            "title": "HTTP header scan error",
            "severity": "low",
            "description": str(e),
            "category": "headers",
        })
    return issues


def check_xss(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Try to reflect a harmless script tag via query parameters."""
    issues: List[Dict] = []
    probe = "<script>alert(1)</script>"

    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["x"] = [probe]
        new_qs = urllib.parse.urlencode(qs, doseq=True)
        test_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))

        resp = requests.get(test_url, timeout=10, headers=headers)
        if probe in resp.text:
            issues.append({
                "title": "Reflected XSS",
                "severity": "high",
                "description": "A harmless script tag was reflected in the response, indicating possible XSS.",
                "evidence": f"URL: {test_url}",
                "category": "xss",
            })
    except Exception as e:
        issues.append({
            "title": "XSS scan error",
            "severity": "low",
            "description": str(e),
            "category": "xss",
        })

    return issues


def check_sql_injection(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Add a simple SQL-shaped test string and look for error messages."""
    issues: List[Dict] = []
    payload = "' OR '1'='1"
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        for key in qs.keys():
            qs[key] = [payload]
        new_qs = urllib.parse.urlencode(qs, doseq=True)
        test_url = urllib.parse.urlunparse(parsed._replace(query=new_qs))

        resp = requests.get(test_url, timeout=10, headers=headers)

        soup = BeautifulSoup(resp.text, "lxml")
        text = soup.text.lower()
        if "sql" in text or "syntax" in text:
            issues.append({
                "title": "Potential SQL injection",
                "severity": "high",
                "description": "The response contains what looks like a SQL error message.",
                "evidence": f"URL: {test_url}",
                "category": "sqli",
            })
    except Exception as e:
        issues.append({
            "title": "SQL injection scan error",
            "severity": "low",
            "description": str(e),
            "category": "sqli",
        })
    return issues


def check_directory_traversal(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Try to access sensitive files via a file parameter."""
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["file"] = ["../../../../etc/passwd"]
        test_url = urllib.parse.urlunparse(
            parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
        )
        resp = requests.get(test_url, timeout=10, headers=headers)
        if "root:x:" in resp.text:
            issues.append({
                "title": "Directory traversal",
                "severity": "critical",
                "description": "Sensitive file content appeared in the response.",
                "evidence": "Detected /etc/passwd-style output in the response.",
                "category": "traversal",
            })
    except Exception as e:
        issues.append({
            "title": "Traversal scan error",
            "severity": "low",
            "description": str(e),
            "category": "traversal",
        })
    return issues


def discover_subdomains(hostname: str) -> List[Dict]:
    """Resolve a small set of common subdomains for the host."""
    issues: List[Dict] = []
    try:
        common = ["www", "api", "dev", "staging", "test", "mail"]
        for sub in common:
            fqdn = f"{sub}.{hostname}"
            try:
                answers = dns.resolver.resolve(fqdn, "A")
                ips = [answer.to_text() for answer in answers]
                issues.append({
                    "title": f"Subdomain found: {fqdn}",
                    "severity": "low",
                    "description": f"{fqdn} resolves to {', '.join(ips)}",
                    "category": "subdomain",
                })
            except Exception:
                continue
    except Exception as e:
        issues.append({
            "title": "Subdomain enumeration error",
            "severity": "low",
            "description": str(e),
            "category": "subdomain",
        })
    return issues


def check_cookie_flags(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Inspect Set-Cookie headers for missing security flags."""
    issues: List[Dict] = []
    try:
        resp = requests.get(url, timeout=10, headers=headers)
        set_cookie = resp.headers.get("Set-Cookie")
        if not set_cookie:
            return issues

        header = set_cookie.lower()
        if "httponly" not in header or "secure" not in header:
            issues.append({
                "title": "Session cookies missing security flags",
                "severity": "medium",
                "description": "Set-Cookie headers do not include both HttpOnly and Secure flags.",
                "evidence": f"Set-Cookie: {set_cookie}",
                "category": "cookies",
            })
    except Exception as e:
        issues.append({
            "title": "Cookie flag scan error",
            "severity": "low",
            "description": str(e),
            "category": "cookies",
        })
    return issues


def check_error_leakage(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Look for verbose error messages or stack traces."""
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["scan_error_probe"] = ["1"]
        test_url = urllib.parse.urlunparse(
            parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
        )
        resp = requests.get(test_url, timeout=10, headers=headers)
        text = resp.text

        if resp.status_code >= 500 or any(
            marker in text for marker in ["Exception", "Traceback", "Error:"]
        ):
            issues.append({
                "title": "Verbose error or stack trace exposed",
                "severity": "medium",
                "description": "The application exposed a detailed error message or stack trace.",
                "evidence": f"Status {resp.status_code} on {test_url}",
                "category": "error",
            })
    except Exception as e:
        issues.append({
            "title": "Error leakage scan error",
            "severity": "low",
            "description": str(e),
            "category": "error",
        })
    return issues


def check_broken_access_control(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Perform a simple IDOR-style probe."""
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

        resp1 = requests.get(url1, timeout=10, headers=headers)
        resp2 = requests.get(url2, timeout=10, headers=headers)

        if resp1.status_code == 200 and resp2.status_code == 200 and resp1.text != resp2.text:
            issues.append({
                "title": "Potential broken access control (IDOR)",
                "severity": "medium",
                "description": "Changing a numeric ID in the URL returned a different resource.",
                "evidence": f"Tried {url1} and {url2}",
                "category": "access_control",
            })
    except Exception as e:
        issues.append({
            "title": "Access control scan error",
            "severity": "low",
            "description": str(e),
            "category": "access_control",
        })
    return issues


def check_rate_limiting(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Check for signs of rate limiting."""
    issues: List[Dict] = []
    try:
        responses = []
        for _ in range(5):
            resp = requests.get(url, timeout=5, headers=headers)
            responses.append(resp)

        limited = any(
            r.status_code == 429
            or "retry-after" in (k.lower() for k in r.headers.keys())
            or "too many requests" in r.text.lower()
            for r in responses
        )

        if not limited:
            issues.append({
                "title": "No obvious rate limiting observed",
                "severity": "low",
                "description": "Repeated requests did not show any sign of rate limiting.",
                "category": "rate_limit",
            })
    except Exception as e:
        issues.append({
            "title": "Rate limiting scan error",
            "severity": "low",
            "description": str(e),
            "category": "rate_limit",
        })
    return issues


# --- Orchestration -------------------------------------------------------------


def run_scan(
    target_url: str,
    profile: Optional[List[str]] = None,
    scan_id: Optional[str] = None,
    headers: Optional[Dict] = None,
) -> List[Dict]:
    """Run selected scan modules and report progress."""
    issues: List[Dict] = []

    parsed = urllib.parse.urlparse(target_url)
    hostname = parsed.hostname

    if not hostname:
        return [{"title": "Invalid site URL", "severity": "low", "category": "network"}]

    try:
        socket.gethostbyname(hostname)
    except Exception as e:
        return [{
            "title": "DNS resolution failed",
            "severity": "low",
            "description": str(e),
            "category": "network",
        }]

    modules = [
        "tls",
        "headers",
        "xss",
        "sqli",
        "traversal",
        "subdomain",
        "cookies",
        "error",
        "access_control",
        "rate_limit",
    ]

    if profile is None:
        enabled = modules
    else:
        enabled = [m for m in modules if m in profile]

    if not enabled:
        return []

    progress_step = 90 / len(enabled)
    current_progress = 5

    for module in enabled:
        if module == "tls":
            issues.extend(check_tls(hostname))
        elif module == "headers":
            issues.extend(check_http_headers(target_url, headers))
        elif module == "xss":
            issues.extend(check_xss(target_url, headers))
        elif module == "sqli":
            issues.extend(check_sql_injection(target_url, headers))
        elif module == "traversal":
            issues.extend(check_directory_traversal(target_url, headers))
        elif module == "subdomain":
            issues.extend(discover_subdomains(hostname))
        elif module == "cookies":
            issues.extend(check_cookie_flags(target_url, headers))
        elif module == "error":
            issues.extend(check_error_leakage(target_url, headers))
        elif module == "access_control":
            issues.extend(check_broken_access_control(target_url, headers))
        elif module == "rate_limit":
            issues.extend(check_rate_limiting(target_url, headers))

        current_progress += progress_step
        if scan_id:
            send_progress(scan_id, int(current_progress))

    return issues


# --- Entry point ---------------------------------------------------------------


def parse_job_payload(message: Dict) -> Dict:
    raw = message.get("data")
    if raw is None:
        return {}

    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return {}

    request_headers = payload.get("requestHeaders")
    if not isinstance(request_headers, dict):
        request_headers = None

    return {
        "scan_id": payload.get("scanId"),
        "target_url": payload.get("targetUrl"),
        "scan_profile": payload.get("scanProfile"),
        "request_headers": request_headers,
    }


def process_job(message: Dict) -> None:
    job = parse_job_payload(message)

    scan_id = job.get("scan_id")
    target_url = job.get("target_url")
    scan_profile = job.get("scan_profile")
    request_headers = job.get("request_headers")

    if not target_url:
        print("Received job without a targetUrl, skipping.")
        if scan_id:
            send_error(scan_id, "Job missing targetUrl")
        return

    print(f"Processing scan {scan_id} for {target_url}")
    if scan_id:
        send_progress(scan_id, 10)

    issues = run_scan(target_url, scan_profile, scan_id, request_headers)
    send_results(scan_id, issues)


def run_worker_loop(stop_event: threading.Event) -> None:
    pubsub = redis_client.pubsub()
    pubsub.subscribe(JOB_CHANNEL)

    print("Python worker is running and waiting for scan jobs...")

    for message in pubsub.listen():
        if stop_event.is_set():
            return

        if message.get("type") != "message":
            continue

        try:
            process_job(message)
        except Exception as e:
            scan_id = None
            try:
                scan_id = parse_job_payload(message).get("scan_id")
            except Exception:
                scan_id = None

            print(f"Worker error: {e}")
            if scan_id:
                send_error(scan_id, str(e))


def main() -> None:
    stop_event = threading.Event()
    threading.Thread(target=heartbeat_loop, args=(stop_event,), daemon=True).start()
    run_worker_loop(stop_event)


if __name__ == "__main__":
    main()