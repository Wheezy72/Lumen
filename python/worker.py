import os
import json
import html
import re
import ssl
import socket
import threading
import urllib.parse
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Union, Set

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


@dataclass
class DiscoveredTarget:
    method: str
    url: str
    params: Dict[str, str] = field(default_factory=dict)
    data: Dict[str, str] = field(default_factory=dict)
    source_url: str = ""
    source_type: str = "base"
    metadata: Dict[str, str] = field(default_factory=dict)


TargetLike = Union[str, DiscoveredTarget]


def _single_value_params(query: str) -> Dict[str, str]:
    parsed = urllib.parse.parse_qs(query, keep_blank_values=True)
    return {key: values[0] if values else "" for key, values in parsed.items()}


def _target_key(target: DiscoveredTarget) -> Tuple[str, str, Tuple[Tuple[str, str], ...], Tuple[Tuple[str, str], ...]]:
    return (
        target.method.upper(),
        target.url,
        tuple(sorted(target.params.items())),
        tuple(sorted(target.data.items())),
    )


def _dedupe_targets(targets: List[DiscoveredTarget]) -> List[DiscoveredTarget]:
    seen: Set[Tuple[str, str, Tuple[Tuple[str, str], ...], Tuple[Tuple[str, str], ...]]] = set()
    deduped: List[DiscoveredTarget] = []
    for target in targets:
        key = _target_key(target)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(target)
    return deduped


def _normalize_target(target: TargetLike) -> DiscoveredTarget:
    if isinstance(target, DiscoveredTarget):
        method = target.method.upper()
        if method == "GET" and not target.params:
            parsed = urllib.parse.urlparse(target.url)
            target.params.update(_single_value_params(parsed.query))
        return target

    parsed = urllib.parse.urlparse(target)
    return DiscoveredTarget(
        method="GET",
        url=target,
        params=_single_value_params(parsed.query),
        source_url=target,
        source_type="base",
    )


def _target_display(target: TargetLike) -> str:
    normalized = _normalize_target(target)
    return f"{normalized.method.upper()} {normalized.url}"


def _same_origin(url: str, base: urllib.parse.ParseResult) -> bool:
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme in ("http", "https") and parsed.netloc == base.netloc


def _strip_fragment(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse(parsed._replace(fragment=""))


def _page_url_key(url: str) -> str:
    parsed = urllib.parse.urlparse(_strip_fragment(url))
    return urllib.parse.urlunparse(parsed._replace(query=""))


def _is_probable_html(resp: requests.Response) -> bool:
    content_type = resp.headers.get("Content-Type", "").lower()
    return "text/html" in content_type or not content_type


def _parse_html(markup: str) -> BeautifulSoup:
    try:
        return BeautifulSoup(markup, "lxml")
    except Exception:
        return BeautifulSoup(markup, "html.parser")


def _extract_form_fields(form: BeautifulSoup) -> Dict[str, str]:
    fields: Dict[str, str] = {}

    for inp in form.find_all("input"):
        input_type = inp.get("type", "text").strip().lower()
        name = inp.get("name", "").strip()
        if not name or input_type in ("button", "reset", "image", "file"):
            continue
        if input_type == "submit":
            fields[name] = inp.get("value", "Submit")
        elif input_type in ("radio", "checkbox"):
            if inp.get("checked") is not None:
                fields[name] = inp.get("value", "on")
        else:
            fields[name] = inp.get("value", "test")

    for select in form.find_all("select"):
        name = select.get("name", "").strip()
        if not name:
            continue
        selected = select.find("option", selected=True) or select.find("option")
        if selected is None:
            fields[name] = "test"
        else:
            fields[name] = selected.get("value", selected.get_text(strip=True) or "test")

    for textarea in form.find_all("textarea"):
        name = textarea.get("name", "").strip()
        if name:
            fields[name] = textarea.get("value", textarea.get_text() or "test")

    for btn in form.find_all("button"):
        btn_type = btn.get("type", "submit").strip().lower()
        name = btn.get("name", "").strip()
        if btn_type == "submit" and name:
            fields[name] = btn.get("value", btn.get_text(strip=True) or "Submit")

    return fields


def _merge_url_query(url: str, params: Dict[str, str]) -> str:
    parsed = urllib.parse.urlparse(url)
    query_params = _single_value_params(parsed.query)
    query_params.update(params)
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query_params)))


def _crawl_site(
    base_url: str,
    headers: Optional[Dict] = None,
    max_depth: int = 2,
    max_pages: int = 25,
    max_targets: int = 100,
) -> Tuple[List[DiscoveredTarget], Dict[str, str]]:
    base = urllib.parse.urlparse(base_url)
    targets: List[DiscoveredTarget] = [
        DiscoveredTarget(
            method="GET",
            url=base_url,
            params=_single_value_params(base.query),
            source_url=base_url,
            source_type="base",
        )
    ]
    crawled_pages: Dict[str, str] = {}
    queued: Set[str] = {_page_url_key(base_url)}
    visited: Set[str] = set()
    queue: List[Tuple[str, int]] = [(base_url, 0)]

    while queue and len(visited) < max_pages and len(targets) < max_targets:
        page_url, depth = queue.pop(0)
        page_key = _page_url_key(page_url)
        if page_key in visited or not _same_origin(page_url, base):
            continue
        visited.add(page_key)

        try:
            resp = requests.get(page_url, timeout=10, headers=headers)
        except Exception as e:
            print(f"Auto-crawl fetch error for {page_url}: {e}")
            continue

        if not _is_probable_html(resp):
            continue

        crawled_pages[page_url] = resp.text
        soup = _parse_html(resp.text)

        for tag in soup.find_all("a", href=True):
            href = tag["href"].strip()
            if not href or href.startswith("#") or href.lower().startswith(("javascript:", "mailto:", "tel:")):
                continue

            full = _strip_fragment(urllib.parse.urljoin(page_url, href))
            parsed_link = urllib.parse.urlparse(full)
            if not _same_origin(full, base):
                continue

            if parsed_link.query and len(targets) < max_targets:
                targets.append(DiscoveredTarget(
                    method="GET",
                    url=full,
                    params=_single_value_params(parsed_link.query),
                    source_url=page_url,
                    source_type="link",
                ))

            link_page_key = _page_url_key(full)
            if depth < max_depth and link_page_key not in visited and link_page_key not in queued:
                queued.add(link_page_key)
                queue.append((urllib.parse.urlunparse(parsed_link._replace(query="")), depth + 1))

        for form in soup.find_all("form"):
            if len(targets) >= max_targets:
                break
            action = form.get("action", "").strip()
            method = form.get("method", "get").strip().upper()
            if method not in ("GET", "POST"):
                method = "GET"

            form_url = _strip_fragment(urllib.parse.urljoin(page_url, action) if action else page_url)
            if not _same_origin(form_url, base):
                continue

            fields = _extract_form_fields(form)
            if not fields:
                continue

            if method == "GET":
                target_url = _merge_url_query(form_url, fields)
                targets.append(DiscoveredTarget(
                    method="GET",
                    url=target_url,
                    params=fields,
                    source_url=page_url,
                    source_type="form",
                ))
            else:
                targets.append(DiscoveredTarget(
                    method="POST",
                    url=form_url,
                    data=fields,
                    source_url=page_url,
                    source_type="form",
                ))

    return _dedupe_targets(targets)[:max_targets], crawled_pages


def auto_crawl_targets(
    base_url: str,
    headers: Optional[Dict] = None,
    max_depth: int = 2,
    max_pages: int = 25,
    max_targets: int = 100,
) -> List[DiscoveredTarget]:
    """
    Bounded same-host crawl for links and forms.

    Returns discovered GET/POST targets. Public callers that still pass URL
    strings to active checks remain supported by target normalization helpers.
    """
    try:
        targets, _ = _crawl_site(base_url, headers, max_depth, max_pages, max_targets)
        return targets
    except Exception as e:
        print(f"Auto-crawl error for {base_url}: {e}")
        return [_normalize_target(base_url)]


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


def _send_probe(target: DiscoveredTarget, key: str, value: str, headers: Optional[Dict]) -> Tuple[str, requests.Response]:
    method = target.method.upper()
    if method == "POST":
        data = dict(target.data)
        data[key] = value
        return target.url, requests.post(target.url, data=data, timeout=10, headers=headers)

    params = dict(target.params)
    if not params:
        parsed = urllib.parse.urlparse(target.url)
        params = _single_value_params(parsed.query)
    params[key] = value
    parsed = urllib.parse.urlparse(target.url)
    test_url = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(params)))
    return test_url, requests.get(test_url, timeout=10, headers=headers)


def _target_field_names(target: DiscoveredTarget, fallback_get_params: Optional[List[str]] = None) -> List[str]:
    method = target.method.upper()
    if method == "POST":
        return list(target.data.keys())

    params = dict(target.params)
    if not params:
        parsed = urllib.parse.urlparse(target.url)
        params = _single_value_params(parsed.query)

    if params:
        return list(params.keys())
    return fallback_get_params or []


def check_xss(target: TargetLike, headers: Optional[Dict] = None) -> List[Dict]:
    """Try to reflect a harmless script tag via every query parameter or POST field."""
    issues: List[Dict] = []
    probe = "<script>alert(1)</script>"

    try:
        normalized = _normalize_target(target)
        keys = _target_field_names(normalized)

        if not keys:
            return issues

        for key in keys:
            try:
                test_url, resp = _send_probe(normalized, key, probe, headers)
                # Check raw text and HTML-decoded text
                decoded = html.unescape(resp.text)
                if probe in resp.text or probe in decoded:
                    issues.append({
                        "title": "Reflected XSS",
                        "severity": "critical",
                        "description": (
                            f"Script tag injected into param '{key}' was reflected unescaped in the response, "
                            "indicating a Reflected Cross-Site Scripting vulnerability."
                        ),
                        "evidence": f"Method: {normalized.method.upper()} | Param: {key} | URL: {test_url}",
                        "category": "xss",
                    })
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


def check_sql_injection(target: TargetLike, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject SQL payloads into every query parameter or POST field and look for error messages."""
    issues: List[Dict] = []
    try:
        normalized = _normalize_target(target)
        keys = _target_field_names(normalized)

        if not keys:
            return issues

        for key in keys:
            for payload in _SQLI_PAYLOADS:
                try:
                    test_url, resp = _send_probe(normalized, key, payload, headers)
                    soup = _parse_html(resp.text)
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
                            "evidence": (
                                f"Method: {normalized.method.upper()} | Param: {key} | "
                                f"Payload: {payload} | Match: '{matched}' | URL: {test_url}"
                            ),
                            "category": "sqli",
                        })
                        break
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


def check_directory_traversal(target: TargetLike, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject path-traversal payloads into every query parameter or POST field."""
    issues: List[Dict] = []
    try:
        normalized = _normalize_target(target)
        fallback = ["file", "page", "path"] if normalized.method.upper() == "GET" else []
        keys_to_test = _target_field_names(normalized, fallback)

        for key in keys_to_test:
            for payload in _TRAVERSAL_PAYLOADS:
                try:
                    test_url, resp = _send_probe(normalized, key, payload, headers)
                    matched = next((m for m in _TRAVERSAL_MARKERS if m in resp.text.lower()), None)
                    if matched:
                        issues.append({
                            "title": "Path Traversal / Local File Inclusion",
                            "severity": "critical",
                            "description": (
                                f"Injecting `{payload}` into param '{key}' returned file system content, "
                                "indicating a Path Traversal or Local File Inclusion vulnerability."
                            ),
                            "evidence": (
                                f"Method: {normalized.method.upper()} | Param: {key} | "
                                f"Payload: {payload} | Marker: '{matched}' | URL: {test_url}"
                            ),
                            "category": "traversal",
                        })
                        break
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


_SECRET_PATTERNS = [
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("JWT token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("Bearer token", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b", re.IGNORECASE)),
    (
        "Hardcoded client secret",
        re.compile(
            r"\b(apiKey|api_key|token|secret|password|clientSecret)\b\s*[:=]\s*['\"]([^'\"]{16,})['\"]",
            re.IGNORECASE,
        ),
    ),
]

_DOM_SINK_PATTERNS = [
    ("Dangerous DOM sink: innerHTML", re.compile(r"\.innerHTML\s*=", re.IGNORECASE)),
    ("Dangerous DOM sink: outerHTML", re.compile(r"\.outerHTML\s*=", re.IGNORECASE)),
    ("Dangerous DOM sink: document.write", re.compile(r"\bdocument\.write\s*\(", re.IGNORECASE)),
    ("Dangerous JavaScript execution: eval", re.compile(r"\beval\s*\(", re.IGNORECASE)),
    ("String-based setTimeout", re.compile(r"\bsetTimeout\s*\(\s*['\"]", re.IGNORECASE)),
    ("String-based setInterval", re.compile(r"\bsetInterval\s*\(\s*['\"]", re.IGNORECASE)),
]

_TOKEN_STORAGE_RE = re.compile(
    r"\b(localStorage|sessionStorage)\.setItem\s*\([^)]*(token|jwt|auth|secret)[^)]*\)",
    re.IGNORECASE,
)
_SOURCEMAP_RE = re.compile(r"sourceMappingURL\s*=\s*([^\s*]+)")
_STRING_LITERAL_RE = re.compile(r"['\"]([^'\"]{2,300})['\"]")
_SUSPICIOUS_ENDPOINT_RE = re.compile(r"/[^'\"\s<>]*(debug|admin|internal|hidden|test|dev|api|swagger|graphql)[^'\"\s<>]*", re.IGNORECASE)


def _short_match(value: str, limit: int = 160) -> str:
    value = value.strip()
    return value if len(value) <= limit else value[:limit] + "…"


def _add_static_finding(
    issues: List[Dict],
    seen: Set[Tuple[str, str, str, str]],
    *,
    title: str,
    severity: str,
    description: str,
    evidence: str,
    category: str,
    matched: str,
) -> None:
    key = (category, title, evidence, matched)
    if key in seen:
        return
    seen.add(key)
    issues.append({
        "title": title,
        "severity": severity,
        "description": description,
        "evidence": evidence,
        "category": category,
    })


def _script_sources_from_pages(
    crawled_pages_or_targets: Optional[Union[Dict[str, str], List[TargetLike]]],
    headers: Optional[Dict],
) -> Tuple[Dict[str, str], List[Tuple[str, Optional[str], str]]]:
    pages: Dict[str, str] = {}
    scripts: List[Tuple[str, Optional[str], str]] = []

    if isinstance(crawled_pages_or_targets, dict):
        pages = crawled_pages_or_targets
    elif isinstance(crawled_pages_or_targets, list):
        for target in crawled_pages_or_targets[:25]:
            normalized = _normalize_target(target)
            if normalized.method.upper() != "GET":
                continue
            page_url = urllib.parse.urlunparse(urllib.parse.urlparse(normalized.url)._replace(query=""))
            if page_url in pages:
                continue
            try:
                resp = requests.get(page_url, timeout=10, headers=headers)
                if _is_probable_html(resp):
                    pages[page_url] = resp.text
            except Exception:
                continue

    for page_url, html_text in pages.items():
        soup = _parse_html(html_text)
        for index, tag in enumerate(soup.find_all("script")):
            src = tag.get("src")
            if src:
                scripts.append((page_url, urllib.parse.urljoin(page_url, src), ""))
            else:
                scripts.append((page_url, None, tag.string or tag.get_text() or ""))

    return pages, scripts


def check_client_sast(
    crawled_pages_or_targets: Optional[Union[Dict[str, str], List[TargetLike], TargetLike]],
    headers: Optional[Dict] = None,
    max_scripts: int = 50,
    max_script_bytes: int = 500_000,
) -> List[Dict]:
    """Analyze same-origin JavaScript and inline scripts for conservative client-side findings."""
    issues: List[Dict] = []
    seen: Set[Tuple[str, str, str, str]] = set()

    if isinstance(crawled_pages_or_targets, (str, DiscoveredTarget)):
        pages_or_targets: Optional[Union[Dict[str, str], List[TargetLike]]] = [crawled_pages_or_targets]
    else:
        pages_or_targets = crawled_pages_or_targets

    pages, scripts = _script_sources_from_pages(pages_or_targets, headers)
    if not pages and not scripts:
        return issues

    script_count = 0
    fetched_sources: Set[str] = set()

    for page_url, script_url, inline_code in scripts:
        if script_count >= max_scripts:
            break

        code = inline_code
        source = f"{page_url} inline script"
        base = urllib.parse.urlparse(page_url)

        if script_url:
            script_url = _strip_fragment(script_url)
            if script_url in fetched_sources or not _same_origin(script_url, base):
                continue
            fetched_sources.add(script_url)
            source = script_url
            try:
                resp = requests.get(script_url, timeout=10, headers=headers)
                if resp.status_code >= 400:
                    continue
                code = resp.text
            except Exception:
                continue

        script_count += 1
        code = code[:max_script_bytes]

        for title, pattern in _SECRET_PATTERNS:
            for match in pattern.finditer(code):
                matched = match.group(0)
                if len(matched) < 16:
                    continue
                _add_static_finding(
                    issues,
                    seen,
                    title=title,
                    severity="high",
                    description="JavaScript appears to contain a hardcoded credential or token-like value.",
                    evidence=f"Source: {source} | Match: {_short_match(matched)}",
                    category="secret",
                    matched=matched,
                )

        for title, pattern in _DOM_SINK_PATTERNS:
            for match in pattern.finditer(code):
                matched = match.group(0)
                _add_static_finding(
                    issues,
                    seen,
                    title=title,
                    severity="medium",
                    description="Client-side JavaScript uses a sink commonly associated with DOM XSS when fed untrusted data.",
                    evidence=f"Source: {source} | Sink: {matched}",
                    category="client_sast",
                    matched=matched,
                )

        for match in _TOKEN_STORAGE_RE.finditer(code):
            matched = match.group(0)
            _add_static_finding(
                issues,
                seen,
                title="Sensitive token stored in web storage",
                severity="medium",
                description="Client-side code stores token/auth/secret material in localStorage or sessionStorage.",
                evidence=f"Source: {source} | Code: {_short_match(matched)}",
                category="secret",
                matched=matched,
            )

        for match in _STRING_LITERAL_RE.finditer(code):
            literal = match.group(1)
            endpoint_match = _SUSPICIOUS_ENDPOINT_RE.search(literal)
            if not endpoint_match:
                continue
            endpoint = endpoint_match.group(0)
            _add_static_finding(
                issues,
                seen,
                title="Suspicious endpoint discovered in client JavaScript",
                severity="low",
                description="JavaScript contains a relative or same-origin path that may expose hidden, debug, API, or admin functionality.",
                evidence=f"Source: {source} | Endpoint: {endpoint}",
                category="endpoint_discovery",
                matched=endpoint,
            )

        for match in _SOURCEMAP_RE.finditer(code):
            map_ref = match.group(1).strip()
            _add_static_finding(
                issues,
                seen,
                title="JavaScript source map reference exposed",
                severity="low",
                description="A JavaScript bundle references a source map, which can expose original source code.",
                evidence=f"Source: {source} | sourceMappingURL={map_ref}",
                category="source_map",
                matched=map_ref,
            )

        if script_url:
            candidates = []
            for match in _SOURCEMAP_RE.finditer(code):
                candidates.append(urllib.parse.urljoin(script_url, match.group(1).strip()))
            candidates.append(script_url + ".map")

            for map_url in candidates[:3]:
                if not _same_origin(map_url, base):
                    continue
                try:
                    map_resp = requests.get(map_url, timeout=5, headers=headers)
                    if map_resp.status_code == 200:
                        _add_static_finding(
                            issues,
                            seen,
                            title="JavaScript source map is fetchable",
                            severity="low",
                            description="A JavaScript source map is publicly fetchable and may expose original source code.",
                            evidence=f"Source map URL: {map_url}",
                            category="source_map",
                            matched=map_url,
                        )
                except Exception:
                    continue

    return issues


# --- Orchestration -------------------------------------------------------------


def _dedupe_issues(issues: List[Dict]) -> List[Dict]:
    seen_keys: Set[Tuple[str, str, str]] = set()
    deduped: List[Dict] = []
    for issue in issues:
        key = (issue.get("title", ""), issue.get("category", ""), issue.get("evidence", ""))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(issue)
    return deduped


def run_scan(
    target_url: str,
    profile: Optional[List[str]] = None,
    scan_id: Optional[str] = None,
    headers: Optional[Dict] = None,
    progress_start: int = 5,
    progress_end: int = 95,
    crawled_targets: Optional[List[TargetLike]] = None,
    crawled_pages: Optional[Dict[str, str]] = None,
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
        "client_sast",
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
    scan_targets = _dedupe_targets([_normalize_target(t) for t in (crawled_targets or [target_url])])

    for module in enabled:
        if module == "tls":
            # Skip TLS check entirely for plain HTTP targets — it will always
            # fail with a confusing "handshake error" that is not a real finding.
            if parsed.scheme == "https":
                issues.extend(check_tls(hostname))
        elif module == "headers":
            issues.extend(check_http_headers(target_url, headers))
        elif module == "xss":
            for target in scan_targets:
                issues.extend(check_xss(target, headers))
        elif module == "sqli":
            for target in scan_targets:
                issues.extend(check_sql_injection(target, headers))
        elif module == "traversal":
            for target in scan_targets:
                issues.extend(check_directory_traversal(target, headers))
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
        elif module == "client_sast":
            issues.extend(check_client_sast(crawled_pages or scan_targets, headers))

        current_progress += progress_step
        if scan_id:
            send_progress(scan_id, int(current_progress))

    return _dedupe_issues(issues)


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

    print(f"  Auto-crawling {target_url} for same-host links and forms…")
    targets, crawled_pages = _crawl_site(target_url, request_headers)
    print(f"  Discovered {len(targets)} target(s) across {len(crawled_pages)} page(s).")

    if scan_id:
        send_progress(scan_id, 10)

    for i, target in enumerate(targets, start=1):
        print(f"  Target {i}/{len(targets)}: {_target_display(target)}")

    issues = run_scan(
        target_url,
        scan_profile,
        scan_id,
        request_headers,
        progress_start=10,
        progress_end=95,
        crawled_targets=targets,
        crawled_pages=crawled_pages,
    )
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
