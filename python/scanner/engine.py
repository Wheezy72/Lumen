import socket
import urllib.parse
from typing import Dict, List, Optional

from .templates import make_get_template, template_to_url
from .findings import normalize_findings
from .modules.access_control import check_broken_access_control
from .modules.command_injection import check_command_injection_template
from .modules.sast import check_sast_source
from .modules.cookies import check_cookie_flags
from .modules.cors import check_cors_policy
from .modules.csrf import check_csrf_template
from .modules.error_leakage import check_error_leakage
from .modules.exposure import check_sensitive_exposure
from .modules.headers import check_http_headers
from .modules.rate_limit import check_rate_limiting
from .modules.redirect import check_open_redirect_template
from .modules.sqli import check_sql_injection_template
from .modules.subdomain import discover_subdomains
from .modules.tls import check_tls
from .modules.traversal import check_directory_traversal_template
from .modules.xss import check_xss_template


MODULES = [
    "tls",
    "headers",
    "exposure",
    "cors",
    "redirect",
    "xss",
    "sqli",
    "traversal",
    "command_injection",
    "csrf",
    "subdomain",
    "cookies",
    "error",
    "access_control",
    "rate_limit",
    "sast",
]


def run_scan(
    target_url: str,
    profile: Optional[List[str]] = None,
    scan_id: Optional[str] = None,
    headers: Optional[Dict] = None,
    progress_start: int = 5,
    progress_end: int = 95,
    template: Optional[Dict] = None,
    skip_modules: Optional[set] = None,
    progress_callback=None,
    source_path: Optional[str] = None,
) -> List[Dict]:
    """Run selected scan modules and report progress."""
    issues: List[Dict] = []
    request_template = template or make_get_template(target_url, source="direct")
    target_url = template_to_url(request_template)

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

    if profile is None:
        enabled = MODULES
    else:
        enabled = [m for m in MODULES if m in profile]

    if skip_modules:
        enabled = [m for m in enabled if m not in skip_modules]

    if not enabled:
        return []

    progress_range = progress_end - progress_start
    progress_step = progress_range / len(enabled)
    current_progress = progress_start

    for module in enabled:
        if module == "tls":
            if parsed.scheme == "https":
                issues.extend(check_tls(hostname))
        elif module == "headers":
            issues.extend(check_http_headers(target_url, headers))
        elif module == "exposure":
            issues.extend(check_sensitive_exposure(target_url, headers))
        elif module == "cors":
            issues.extend(check_cors_policy(target_url, headers))
        elif module == "redirect":
            issues.extend(check_open_redirect_template(request_template, headers))
        elif module == "xss":
            issues.extend(check_xss_template(request_template, headers))
        elif module == "sqli":
            issues.extend(check_sql_injection_template(request_template, headers))
        elif module == "traversal":
            issues.extend(check_directory_traversal_template(request_template, headers))
        elif module == "command_injection":
            issues.extend(check_command_injection_template(request_template, headers))
        elif module == "csrf":
            issues.extend(check_csrf_template(request_template))
        elif module == "subdomain":
            issues.extend(discover_subdomains(hostname))
        elif module == "cookies":
            issues.extend(check_cookie_flags(target_url, headers))
        elif module == "error":
            issues.extend(check_error_leakage(target_url, headers))
        elif module == "access_control":
            issues.extend(check_broken_access_control(request_template, headers))
        elif module == "rate_limit":
            issues.extend(check_rate_limiting(target_url, headers))
        elif module == "sast":
            if source_path:
                issues.extend(check_sast_source(source_path))
            else:
                issues.append({
                    "title": "SAST skipped: no source path supplied",
                    "severity": "info",
                    "category": "sast",
                    "description": (
                        "Lightweight SAST runs only when a sourcePath is provided. "
                        "Pass sourcePath in the scan request to enable it."
                    ),
                    "evidence": "Module 'sast' selected without sourcePath",
                })

        current_progress += progress_step
        if scan_id and progress_callback:
            progress_callback(scan_id, int(current_progress))

    return normalize_findings(issues)
