from typing import Dict, List, Optional

import requests

from scanner.config import REQUEST_TIMEOUT
from scanner.templates import base_origin


EXPOSURE_CHECKS = [
    ("/.env", "Environment file exposed", "high", ["DB_PASSWORD=", "APP_KEY=", "SECRET_KEY=", "DATABASE_URL=", "API_KEY="]),
    ("/.git/config", "Git repository metadata exposed", "high", ["[core]", "repositoryformatversion"]),
    ("/phpinfo.php", "PHP info page exposed", "medium", ["phpinfo()", "PHP Version"]),
    ("/backup.zip", "Backup archive exposed", "medium", []),
    ("/db.sql", "Database dump exposed", "high", ["CREATE TABLE", "INSERT INTO", "-- MySQL dump"]),
]


def check_sensitive_exposure(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    """Check a short list of high-signal sensitive files on the target origin."""
    issues: List[Dict] = []
    origin = base_origin(url).rstrip("/")

    for path, title, severity, markers in EXPOSURE_CHECKS:
        test_url = f"{origin}{path}"
        try:
            resp = requests.get(test_url, timeout=REQUEST_TIMEOUT, headers=headers)
            if resp.status_code != 200:
                continue

            body = resp.text[:5000]
            matched = next((marker for marker in markers if marker.lower() in body.lower()), None)

            if not matched and markers:
                continue
            if not matched and len(resp.content or b"") < 128:
                continue

            issues.append({
                "title": title,
                "severity": severity,
                "description": "A sensitive diagnostic, backup, repository, or configuration file is publicly reachable.",
                "evidence": f"URL: {test_url} | Status: {resp.status_code} | Marker: {matched or 'non-empty file response'}",
                "category": "exposure",
                "url": test_url,
                "method": "GET",
                "confidence": "confirmed",
            })
        except Exception:
            continue

    return issues
