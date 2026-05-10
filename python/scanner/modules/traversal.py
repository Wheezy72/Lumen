from typing import Dict, List, Optional

from scanner.templates import clone_template, iter_input_fields, make_get_template, send_template, set_input_field, template_to_url


_TRAVERSAL_PAYLOADS = [
    "../../../../etc/passwd",
    "..%2F..%2F..%2F..%2Fetc%2Fpasswd",
    "....//....//....//....//etc/passwd",
    "../../../../windows/win.ini",
    "..%2F..%2F..%2F..%2Fwindows%2Fwin.ini",
]

_TRAVERSAL_MARKERS = ["root:x:", "[fonts]", "[extensions]", "boot loader"]


def check_directory_traversal_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject path-traversal payloads into every discovered input field."""
    issues: List[Dict] = []
    try:
        fields = iter_input_fields(template)
        if not fields:
            fields = [("params", "file"), ("params", "page"), ("params", "path")]

        for location, key in fields:
            for payload in _TRAVERSAL_PAYLOADS:
                test_template = clone_template(template)
                set_input_field(test_template, location, key, payload)
                test_url = template_to_url(test_template)
                try:
                    resp = send_template(test_template, headers)
                    matched = next((m for m in _TRAVERSAL_MARKERS if m in resp.text.lower()), None)
                    if matched:
                        method = str(test_template.get("method", "GET")).upper()
                        issues.append({
                            "title": "Path Traversal / Local File Inclusion",
                            "severity": "critical",
                            "description": (
                                f"Injecting `{payload}` into field '{key}' returned file system content, "
                                "indicating a Path Traversal or Local File Inclusion vulnerability."
                            ),
                            "evidence": (
                                f"Method: {method} | Field: {key} | Payload: {payload} | "
                                f"Marker: '{matched}' | URL: {test_url}"
                            ),
                            "category": "traversal",
                            "url": test_template.get("url"),
                            "method": method,
                            "parameter": key,
                            "payload": payload,
                            "confidence": "confirmed",
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


def check_directory_traversal(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    return check_directory_traversal_template(make_get_template(url, source="direct"), headers)
