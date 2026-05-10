from typing import Dict, List

from scanner.config import CSRF_TOKEN_NAMES


def has_csrf_token(template: Dict) -> bool:
    keys = set()
    keys.update((template.get("params") or {}).keys())
    keys.update((template.get("data") or {}).keys())
    return any(key.lower() in CSRF_TOKEN_NAMES or "csrf" in key.lower() for key in keys)


def is_state_changing_template(template: Dict) -> bool:
    method = str(template.get("method", "GET")).upper()
    if method != "POST":
        return False

    url = template.get("url", "").lower()
    keys = " ".join((template.get("data") or {}).keys()).lower()
    indicators = [
        "delete", "update", "create", "change", "save", "edit", "profile",
        "settings", "admin", "password", "email", "upload", "comment",
        "message", "name",
    ]
    return any(indicator in url or indicator in keys for indicator in indicators) or bool(template.get("data"))


def check_csrf_template(template: Dict) -> List[Dict]:
    """Flag likely state-changing POST forms that do not include an anti-CSRF token."""
    if not is_state_changing_template(template) or has_csrf_token(template):
        return []

    fields = sorted((template.get("data") or {}).keys())
    return [{
        "title": "Potential CSRF protection missing",
        "severity": "medium",
        "description": (
            "A state-changing POST form does not include an obvious anti-CSRF token. "
            "SameSite cookies or custom headers may still provide protection, so review this manually."
        ),
        "evidence": f"Method: POST | URL: {template.get('url')} | Fields: {', '.join(fields)}",
        "category": "csrf",
        "url": template.get("url"),
        "method": "POST",
        "confidence": "potential",
    }]
