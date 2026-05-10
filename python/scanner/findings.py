import hashlib
import urllib.parse
from typing import Dict, Iterable, List


def _clean(value) -> str:
    return str(value or "").strip().lower()


def _host_from_url(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return ""


def build_fingerprint(issue: Dict) -> str:
    category = _clean(issue.get("category") or "general")
    title = _clean(issue.get("title"))
    method = _clean(issue.get("method"))
    url = _clean(issue.get("url"))
    parameter = _clean(issue.get("parameter"))

    if category == "headers":
        header = title.replace("missing security header:", "").strip()
        raw = f"headers|{url}|{header}"
    elif category in {"tls", "ssl", "subdomain", "exposure"}:
        raw = f"{category}|{_host_from_url(url)}|{title}"
    elif method or url or parameter:
        raw = f"{category}|{method}|{url}|{parameter or title}"
    else:
        raw = f"{category}|{title}|{_clean(issue.get('evidence'))}"

    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return f"{category}:{digest}"


def normalize_finding(issue: Dict) -> Dict:
    if not issue.get("fingerprint"):
        issue["fingerprint"] = build_fingerprint(issue)
    if not issue.get("confidence"):
        title = str(issue.get("title") or "").lower()
        issue["confidence"] = "potential" if title.startswith("potential") else "confirmed"
    return issue


def normalize_findings(issues: Iterable[Dict]) -> List[Dict]:
    return [normalize_finding(dict(issue)) for issue in issues]


class StringLike:
    def __init__(self, value):
        self.value = str(value or "")

    def lower(self):
        return self.value.lower()
