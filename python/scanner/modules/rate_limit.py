from typing import Dict, List, Optional

import requests


def check_rate_limiting(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Check for signs of rate limiting. Only reports missing rate limiting on login/auth-style endpoints."""
    issues: List[Dict] = []
    try:
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
