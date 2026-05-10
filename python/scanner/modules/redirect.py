import urllib.parse
from typing import Dict, List, Optional

import requests

from scanner.config import REDIRECT_PARAM_NAMES, REQUEST_TIMEOUT
from scanner.templates import clone_template, iter_input_fields, set_input_field, template_to_url


def check_open_redirect_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Test likely redirect fields for external redirects."""
    issues: List[Dict] = []
    redirect_target = "https://evil.lumen.invalid/redirect-test"
    fields = [
        (location, key)
        for location, key in iter_input_fields(template)
        if key.lower() in REDIRECT_PARAM_NAMES
    ]

    for location, key in fields:
        test_template = clone_template(template)
        set_input_field(test_template, location, key, redirect_target)
        method = str(test_template.get("method", "GET")).upper()
        test_url = template_to_url(test_template)
        merged_headers = {}
        if headers:
            merged_headers.update(headers)
        merged_headers.update(test_template.get("headers") or {})

        try:
            if method == "POST":
                resp = requests.post(
                    test_url,
                    data=test_template.get("data") or {},
                    timeout=REQUEST_TIMEOUT,
                    headers=merged_headers or None,
                    allow_redirects=False,
                )
            else:
                resp = requests.get(
                    test_url,
                    timeout=REQUEST_TIMEOUT,
                    headers=merged_headers or None,
                    allow_redirects=False,
                )

            location_header = resp.headers.get("Location", "")
            redirect_host = urllib.parse.urlparse(urllib.parse.urljoin(test_url, location_header)).netloc
            if 300 <= resp.status_code < 400 and redirect_host == "evil.lumen.invalid":
                issues.append({
                    "title": "Open redirect",
                    "severity": "medium",
                    "description": "A user-controlled redirect field sends users to an external domain.",
                    "evidence": (
                        f"Method: {method} | Field: {key} | Status: {resp.status_code} | "
                        f"Location: {location_header}"
                    ),
                    "category": "redirect",
                    "url": test_template.get("url"),
                    "method": method,
                    "parameter": key,
                    "payload": redirect_target,
                    "confidence": "confirmed",
                })
                return issues
        except Exception:
            continue

    return issues
