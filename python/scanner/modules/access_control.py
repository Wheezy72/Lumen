import urllib.parse
from typing import Dict, List, Optional

import requests


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
