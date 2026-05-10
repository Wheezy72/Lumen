import urllib.parse
from typing import Dict, List, Optional, Tuple

from ..templates import (
    clone_template,
    iter_input_fields,
    send_template,
    set_input_field,
    template_to_url,
)


ID_FIELD_NAMES = {
    "id", "uid", "user", "user_id", "userid",
    "account", "account_id", "accountid",
    "order", "order_id", "orderid",
    "profile", "profile_id", "profileid",
    "customer", "customer_id", "customerid",
    "doc", "document", "document_id", "documentid",
    "record", "record_id", "recordid",
}


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    longer = max(len(a), len(b))
    shorter = min(len(a), len(b))
    return shorter / longer if longer else 0.0


def _safe_int(value) -> Optional[int]:
    try:
        return int(str(value))
    except Exception:
        return None


def _path_id_candidates(template: Dict) -> List[Tuple[str, str, str]]:
    parsed = urllib.parse.urlparse(template.get("url", ""))
    parts = parsed.path.rstrip("/").split("/")
    candidates: List[Tuple[str, str, str]] = []
    for index, segment in enumerate(parts):
        numeric = _safe_int(segment)
        if numeric is None:
            continue
        new_parts = list(parts)
        new_parts[index] = str(numeric + 1)
        new_path = "/".join(new_parts) or "/"
        new_url = urllib.parse.urlunparse(parsed._replace(path=new_path))
        candidates.append((segment, str(numeric + 1), new_url))
    return candidates


def _id_like_input_fields(template: Dict) -> List[Tuple[str, str, str]]:
    """Return (location, key, current_value) for parameters that look like object IDs."""
    candidates: List[Tuple[str, str, str]] = []
    for location, key in iter_input_fields(template):
        bag = template.get(location) or {}
        value = str(bag.get(key, "")).strip()
        name = key.lower()
        if name in ID_FIELD_NAMES or name.endswith("_id") or name.endswith("id"):
            candidates.append((location, key, value))
        elif value and _safe_int(value) is not None:
            candidates.append((location, key, value))
    return candidates


def check_broken_access_control(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Test for broken access control via ID mutation and auth differential checks."""
    issues: List[Dict] = []

    try:
        method = str(template.get("method", "GET")).upper()

        # ── 1. ID-like field mutation across path/query/form/JSON
        for location, key, current in _id_like_input_fields(template):
            mutated = clone_template(template)
            new_value = str((_safe_int(current) or 0) + 1) if _safe_int(current) is not None else f"{current}_alt"
            set_input_field(mutated, location, key, new_value)

            try:
                base = send_template(template, headers)
                other = send_template(mutated, headers)
            except Exception:
                continue

            if base.status_code == 200 and other.status_code == 200 and _similarity(base.text, other.text) < 0.85:
                issues.append({
                    "title": "Potential broken object access (IDOR)",
                    "severity": "medium",
                    "description": (
                        f"Mutating identifier-like field '{key}' returned a different resource without an "
                        "authorisation error. Confirm whether the application enforces per-user access checks."
                    ),
                    "evidence": (
                        f"Method: {method} | Field: {key} ({location}) | Original: {current} | "
                        f"Mutated: {new_value} | URL: {template_to_url(mutated)}"
                    ),
                    "category": "access_control",
                    "url": mutated.get("url"),
                    "method": method,
                    "parameter": key,
                    "payload": new_value,
                    "confidence": "potential",
                })
                break

        # ── 2. Numeric path-segment mutation (kept from earlier IDOR probe)
        if method == "GET":
            for original_segment, new_segment, new_url in _path_id_candidates(template):
                try:
                    base = send_template(template, headers)
                    other = send_template(clone_template({**template, "url": new_url}), headers)
                except Exception:
                    continue
                if base.status_code == 200 and other.status_code == 200 and _similarity(base.text, other.text) < 0.85:
                    issues.append({
                        "title": "Potential broken object access (path ID)",
                        "severity": "medium",
                        "description": "Replacing a numeric path segment returned a different resource.",
                        "evidence": f"Original segment: {original_segment} | Mutated segment: {new_segment} | URL: {new_url}",
                        "category": "access_control",
                        "url": new_url,
                        "method": "GET",
                        "parameter": "path",
                        "payload": new_segment,
                        "confidence": "potential",
                    })
                    break

        # ── 3. Authenticated vs unauthenticated differential
        if headers and any(k.lower() in {"cookie", "authorization"} for k in headers.keys()):
            try:
                authed = send_template(template, headers)
                anon = send_template(template, None)
            except Exception:
                authed = anon = None

            if authed is not None and anon is not None:
                if authed.status_code == 200 and anon.status_code == 200 and _similarity(authed.text, anon.text) > 0.95:
                    issues.append({
                        "title": "Potential unauthenticated access to protected resource",
                        "severity": "high",
                        "description": (
                            "The endpoint returned similar content for both authenticated and unauthenticated "
                            "requests. Verify whether this resource should require authentication."
                        ),
                        "evidence": (
                            f"Method: {method} | URL: {template_to_url(template)} | "
                            f"Auth status: {authed.status_code} | Anon status: {anon.status_code}"
                        ),
                        "category": "access_control",
                        "url": template.get("url"),
                        "method": method,
                        "confidence": "potential",
                    })
    except Exception as e:
        issues.append({
            "title": "Access control scan error",
            "severity": "low",
            "description": str(e),
            "category": "access_control",
        })

    return issues
