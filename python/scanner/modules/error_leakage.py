import urllib.parse
from typing import Dict, List, Optional

import requests


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
