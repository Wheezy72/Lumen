from typing import Dict, List, Optional

import requests

from scanner.config import REQUEST_TIMEOUT


def check_cors_policy(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Check for risky CORS origin reflection with credentials."""
    issues: List[Dict] = []
    origin = "https://evil.lumen.invalid"
    request_headers = {}
    if headers:
        request_headers.update(headers)
    request_headers["Origin"] = origin

    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers=request_headers)
        allow_origin = resp.headers.get("Access-Control-Allow-Origin", "")
        allow_credentials = resp.headers.get("Access-Control-Allow-Credentials", "")
        credentials_enabled = allow_credentials.lower() == "true"

        if allow_origin == origin and credentials_enabled:
            issues.append({
                "title": "CORS origin reflection with credentials",
                "severity": "high",
                "description": (
                    "The application reflects an arbitrary Origin header and allows credentials, "
                    "which may let malicious sites read authenticated responses."
                ),
                "evidence": (
                    f"Origin: {origin} | Access-Control-Allow-Origin: {allow_origin} | "
                    f"Access-Control-Allow-Credentials: {allow_credentials}"
                ),
                "category": "cors",
                "url": url,
                "method": "GET",
                "confidence": "confirmed",
            })
        elif allow_origin == "*" and credentials_enabled:
            issues.append({
                "title": "Wildcard CORS with credentials enabled",
                "severity": "medium",
                "description": "The response combines wildcard CORS with credential support, indicating an unsafe CORS policy.",
                "evidence": (
                    f"Origin: {origin} | Access-Control-Allow-Origin: {allow_origin} | "
                    f"Access-Control-Allow-Credentials: {allow_credentials}"
                ),
                "category": "cors",
                "url": url,
                "method": "GET",
                "confidence": "potential",
            })
    except Exception as e:
        issues.append({
            "title": "CORS scan error",
            "severity": "low",
            "description": str(e),
            "category": "cors",
        })

    return issues
