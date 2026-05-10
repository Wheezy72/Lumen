from typing import Dict, List, Optional

import requests


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
