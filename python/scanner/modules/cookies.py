from typing import Dict, List, Optional

import requests


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
