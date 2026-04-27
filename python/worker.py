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


# --- Auto-crawler --------------------------------------------------------------


def auto_crawl_targets(base_url: str, headers: Optional[Dict] = None) -> List[str]:
    """
    Crawl the given URL for <a href> links and <form> inputs.

    Returns a list of parameterised URLs discovered on the page so that
    active checks (XSS, SQLi, traversal …) can be run against real
    parameter names rather than a blind injection into the base URL.
    """
    targets: List[str] = [base_url]
    seen: set = {base_url}

    try:
        resp = requests.get(base_url, timeout=10, headers=headers)
        soup = BeautifulSoup(resp.text, "lxml")
        parsed_base = urllib.parse.urlparse(base_url)

        # ── <a href> links ──────────────────────────────────────────────────
        for tag in soup.find_all("a", href=True):
            href = tag["href"].strip()
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue

            full = urllib.parse.urljoin(base_url, href)
            parsed = urllib.parse.urlparse(full)

            # Stay on the same host
            if parsed.netloc != parsed_base.netloc:
                continue

            if "?" in full and full not in seen:
                seen.add(full)
                targets.append(full)

        # ── <form> inputs ───────────────────────────────────────────────────
        for form in soup.find_all("form"):
            action = form.get("action", "").strip()
            method = form.get("method", "get").strip().lower()

            form_url = urllib.parse.urljoin(base_url, action) if action else base_url
            parsed_form = urllib.parse.urlparse(form_url)

            # Stay on same host and only bother with GET-style forms for now
            if parsed_form.netloc and parsed_form.netloc != parsed_base.netloc:
                continue

            params: Dict[str, str] = {}
            for inp in form.find_all(["input", "select", "textarea"]):
                inp_type = inp.get("type", "text").strip().lower()
                name = inp.get("name", "").strip()
                if not name:
                    continue

                # ── Include submit buttons (name + value) ──────────────────
                # Critical for apps like DVWA where the submit button's
                # name/value (e.g. Submit=Submit) must be present in the
                # query string to trigger the back-end handler.
                if inp_type == "submit":
                    value = inp.get("value", "Submit")
                    params[name] = value
                elif inp_type in ("hidden", "text", "number", "email",
                                  "search", "tel", "url", "password"):
                    value = inp.get("value", "test")
                    params[name] = value
                # radio / checkbox: include only checked ones
                elif inp_type in ("radio", "checkbox"):
                    if inp.get("checked") is not None:
                        value = inp.get("value", "on")
                        params[name] = value
                else:
                    # select, textarea, unknown — grab whatever value is set
                    value = inp.get("value", "test")
                    params[name] = value

            # Also pick up <button type="submit"> elements
            for btn in form.find_all("button"):
                btn_type = btn.get("type", "submit").strip().lower()
                if btn_type == "submit":
                    name = btn.get("name", "").strip()
                    if name:
                        params[name] = btn.get("value", btn.get_text(strip=True) or "Submit")

            if not params:
                continue

            qs = urllib.parse.urlencode(params)
            target = urllib.parse.urlunparse(parsed_form._replace(query=qs))

            if target not in seen:
                seen.add(target)
                targets.append(target)

    except Exception as e:
        print(f"Auto-crawl error for {base_url}: {e}")

    return targets


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
                _WEAK_PROTOCOLS = {"TLSv1", "TLSv1.1"}
                if proto and proto in _WEAK_PROTOCOLS:
                    issues.append({
                        "title": f"Outdated TLS protocol in use ({proto})",
                        "severity": "medium",
                        "description": (
                            f"The server negotiated {proto}, which is deprecated and considered insecure. "
                            "TLS 1.3 is the recommended standard; TLS 1.2 is the minimum acceptable version. "
                            "TLS 1.0 and TLS 1.1 must be disabled."
                        ),
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
    """Try to reflect a harmless script tag via every query parameter found in the URL."""
    issues: List[Dict] = []
    probe = "<script>alert(1)</script>"

    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

        if not qs:
            # No query params — nothing to inject into for reflected XSS
            return issues

        for key in list(qs.keys()):
            test_qs = {k: v[:] for k, v in qs.items()}
            test_qs[key] = [probe]
            test_url = urllib.parse.urlunparse(
                parsed._replace(query=urllib.parse.urlencode(test_qs, doseq=True))
            )
            try:
                resp = requests.get(test_url, timeout=10, headers=headers)
                # Check raw text and HTML-decoded text
                import html
                decoded = html.unescape(resp.text)
                if probe in resp.text or probe in decoded:
                    issues.append({
                        "title": "Reflected XSS",
                        "severity": "critical",
                        "description": (
                            f"Script tag injected into param '{key}' was reflected unescaped in the response, "
                            "indicating a Reflected Cross-Site Scripting vulnerability."
                        ),
                        "evidence": f"Param: {key} | URL: {test_url}",
                        "category": "xss",
                    })
                    break  # One confirmed finding is enough per URL
            except Exception:
                continue

    except Exception as e:
        issues.append({
            "title": "XSS scan error",
            "severity": "low",
            "description": str(e),
            "category": "xss",
        })

    return issues


# SQL error patterns covering MySQL, MSSQL, PostgreSQL, Oracle, SQLite, generic PHP
_SQLI_PATTERNS = [
    "you have an error in your sql syntax",
    "warning: mysql",
    "unclosed quotation mark",
    "quoted string not properly terminated",
    "pg_query",
    "ora-",
    "sqlite_",
    "syntax error",
    "sql syntax",
    "mysql_fetch",
    "mysqli_",
    "sqlstate",
    "division by zero",
    "supplied argument is not a valid mysql",
    "valid mysql result",
    "unexpected token",
    "unterminated string",
]

_SQLI_PAYLOADS = [
    "'",
    "' OR '1'='1",
    "' OR '1'='1' --",
    "1 AND 1=2",
]


def check_sql_injection(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject SQL payloads into every query parameter and look for error messages."""
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

        if not qs:
            # No query params — nothing to inject
            return issues

        for key in list(qs.keys()):
            for payload in _SQLI_PAYLOADS:
                test_qs = {k: v[:] for k, v in qs.items()}
                test_qs[key] = [payload]
                test_url = urllib.parse.urlunparse(
                    parsed._replace(query=urllib.parse.urlencode(test_qs, doseq=True))
                )
                try:
                    resp = requests.get(test_url, timeout=10, headers=headers)
                    soup = BeautifulSoup(resp.text, "lxml")
                    body = soup.get_text(" ", strip=True).lower()
                    matched = next((p for p in _SQLI_PATTERNS if p in body), None)
                    if matched:
                        issues.append({
                            "title": "SQL Injection",
                            "severity": "critical",
                            "description": (
                                f"Injecting `{payload}` into param '{key}' triggered a database error, "
                                "confirming SQL Injection."
                            ),
                            "evidence": f"Param: {key} | Payload: {payload} | Match: '{matched}' | URL: {test_url}",
                            "category": "sqli",
                        })
                        return issues  # One confirmed finding is enough
                except Exception:
                    continue

    except Exception as e:
        issues.append({
            "title": "SQL injection scan error",
            "severity": "low",
            "description": str(e),
            "category": "sqli",
        })
    return issues


_TRAVERSAL_PAYLOADS = [
    "../../../../etc/passwd",
    "..%2F..%2F..%2F..%2Fetc%2Fpasswd",
    "....//....//....//....//etc/passwd",
    "../../../../windows/win.ini",
    "..%2F..%2F..%2F..%2Fwindows%2Fwin.ini",
]

_TRAVERSAL_MARKERS = ["root:x:", "[fonts]", "[extensions]", "boot loader"]


def check_directory_traversal(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject path-traversal payloads into every query parameter."""
    issues: List[Dict] = []
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

        # Test existing params first; fall back to adding a 'file' param if none exist
        keys_to_test = list(qs.keys()) if qs else ["file", "page", "path"]

        for key in keys_to_test:
            for payload in _TRAVERSAL_PAYLOADS:
                test_qs = {k: v[:] for k, v in qs.items()} if qs else {}
                test_qs[key] = [payload]
                test_url = urllib.parse.urlunparse(
                    parsed._replace(query=urllib.parse.urlencode(test_qs, doseq=True))
                )
                try:
                    resp = requests.get(test_url, timeout=10, headers=headers)
                    matched = next((m for m in _TRAVERSAL_MARKERS if m in resp.text.lower()), None)
                    if matched:
                        issues.append({
                            "title": "Path Traversal / Local File Inclusion",
                            "severity": "critical",
                            "description": (
                                f"Injecting `{payload}` into param '{key}' returned file system content, "
                                "indicating a Path Traversal or Local File Inclusion vulnerability."
                            ),
                            "evidence": f"Param: {key} | Payload: {payload} | Marker: '{matched}' | URL: {test_url}",
                            "category": "traversal",
                        })
                        return issues
                except Exception:
                    continue

    except Exception as e:
        issues.append({
            "title": "Traversal scan error",
            "severity": "low",
            "description": str(e),
            "category": "traversal",
        })
    return issues


def discover_subdomains(hostname: str) -> List[Dict]:
    """Resolve a small set of common subdomains for the host. Skips IPs and localhost."""
    import ipaddress
    issues: List[Dict] = []

    # Skip subdomain enumeration for raw IPs and localhost — meaningless
    try:
        ipaddress.ip_address(hostname)
        return issues  # It's an IP, no subdomains possible
    except ValueError:
        pass

    if hostname in ("localhost",) or hostname.endswith(".local"):
        return issues

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
    """Check for signs of rate limiting. Only reports missing rate limiting on login/auth-style endpoints."""
    issues: List[Dict] = []
    try:
        # Only flag missing rate limiting on login/registration/auth endpoints —
        # flagging it on every page creates noise with no real security value.
        url_lower = url.lower()
        is_auth_endpoint = any(
            kw in url_lower
            for kw in ["login", "signin", "register", "signup", "auth", "password", "reset"]
        )

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

        if not limited and is_auth_endpoint:
            issues.append({
                "title": "No rate limiting on authentication endpoint",
                "severity": "medium",
                "description": (
                    "Repeated requests to this authentication endpoint returned no rate-limiting response "
                    "(no HTTP 429, no Retry-After header). This may allow brute-force attacks."
                ),
                "evidence": f"5 rapid requests to {url} — all succeeded without throttling.",
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
    progress_start: int = 5,
    progress_end: int = 95,
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

    progress_range = progress_end - progress_start
    progress_step = progress_range / len(enabled)
    current_progress = progress_start

    for module in enabled:
        if module == "tls":
            # Skip TLS check entirely for plain HTTP targets — it will always
            # fail with a confusing "handshake error" that is not a real finding.
            if parsed.scheme == "https":
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
        send_progress(scan_id, 5)

    # ── Auto-crawl: if the URL has no query string, discover parameterised
    #    targets from the page's links and forms, then scan each one.
    parsed = urllib.parse.urlparse(target_url)
    has_params = bool(parsed.query)

    if not has_params:
        print(f"  Auto-crawling {target_url} for parameterised targets…")
        targets = auto_crawl_targets(target_url, request_headers)
        print(f"  Discovered {len(targets)} target(s) to scan.")

        if scan_id:
            send_progress(scan_id, 10)

        all_issues: List[Dict] = []
        n = len(targets)

        for i, t in enumerate(targets):
            # Divide the 10–95 progress range evenly across all targets
            p_start = 10 + int((i / n) * 85)
            p_end   = 10 + int(((i + 1) / n) * 85)
            print(f"  Scanning target {i + 1}/{n}: {t}")
            issues = run_scan(t, scan_profile, scan_id, request_headers,
                              progress_start=p_start, progress_end=p_end)
            all_issues.extend(issues)

        # De-duplicate by (title, category, evidence) to avoid noise from
        # scanning many similar URLs.
        seen_keys: set = set()
        deduped: List[Dict] = []
        for issue in all_issues:
            key = (issue.get("title", ""), issue.get("category", ""), issue.get("evidence", ""))
            if key not in seen_keys:
                seen_keys.add(key)
                deduped.append(issue)

        send_results(scan_id, deduped)
    else:
        # URL already has parameters — scan it directly.
        issues = run_scan(target_url, scan_profile, scan_id, request_headers,
                          progress_start=10, progress_end=95)
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