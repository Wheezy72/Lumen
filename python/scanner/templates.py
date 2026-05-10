import urllib.parse
from typing import Dict, List, Optional, Tuple

import requests

from .config import CSRF_TOKEN_NAMES, REQUEST_TIMEOUT, STATIC_EXTENSIONS


def normalize_url(url: str) -> str:
    """Remove fragments and normalize empty paths so crawl de-duplication works."""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path or "/"
    return urllib.parse.urlunparse(parsed._replace(path=path, fragment=""))


def is_same_origin(url: str, base_url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    parsed_base = urllib.parse.urlparse(base_url)
    return parsed.scheme in ("http", "https") and parsed.netloc == parsed_base.netloc


def is_crawlable_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.lower()
    return not path.endswith(STATIC_EXTENSIONS)


def base_origin(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def _single_value_params(params: Dict[str, List[str]]) -> Dict[str, str]:
    return {key: values[0] if values else "" for key, values in params.items()}


def make_get_template(url: str, source: str = "link") -> Dict:
    parsed = urllib.parse.urlparse(normalize_url(url))
    params = _single_value_params(urllib.parse.parse_qs(parsed.query, keep_blank_values=True))
    clean_url = urllib.parse.urlunparse(parsed._replace(query=""))
    return {
        "method": "GET",
        "url": clean_url,
        "params": params,
        "data": {},
        "headers": {},
        "source": source,
    }


def template_to_url(template: Dict) -> str:
    parsed = urllib.parse.urlparse(template["url"])
    params = template.get("params") or {}
    query = urllib.parse.urlencode(params, doseq=True)
    return urllib.parse.urlunparse(parsed._replace(query=query))


def send_template(template: Dict, headers: Optional[Dict] = None) -> requests.Response:
    merged_headers = {}
    if headers:
        merged_headers.update(headers)
    merged_headers.update(template.get("headers") or {})

    method = str(template.get("method", "GET")).upper()
    url = template_to_url(template)

    if method == "POST":
        return requests.post(
            url,
            data=template.get("data") or {},
            timeout=REQUEST_TIMEOUT,
            headers=merged_headers or None,
        )

    return requests.get(url, timeout=REQUEST_TIMEOUT, headers=merged_headers or None)


def template_key(template: Dict) -> Tuple:
    return (
        str(template.get("method", "GET")).upper(),
        template.get("url", ""),
        tuple(sorted((template.get("params") or {}).items())),
        tuple(sorted((template.get("data") or {}).items())),
    )


def clone_template(template: Dict) -> Dict:
    return {
        "method": str(template.get("method", "GET")).upper(),
        "url": template.get("url", ""),
        "params": dict(template.get("params") or {}),
        "data": dict(template.get("data") or {}),
        "headers": dict(template.get("headers") or {}),
        "source": template.get("source", ""),
    }


def is_injectable_field(key: str) -> bool:
    name = key.lower()
    return name not in {"submit", *CSRF_TOKEN_NAMES}


def iter_input_fields(template: Dict) -> List[Tuple[str, str]]:
    fields: List[Tuple[str, str]] = []
    for key in (template.get("params") or {}).keys():
        if is_injectable_field(key):
            fields.append(("params", key))
    for key in (template.get("data") or {}).keys():
        if is_injectable_field(key):
            fields.append(("data", key))
    return fields


def set_input_field(template: Dict, location: str, key: str, value: str) -> None:
    if location == "data":
        template.setdefault("data", {})[key] = value
    else:
        template.setdefault("params", {})[key] = value


def add_template(templates: List[Dict], seen_templates: set, template: Dict) -> bool:
    key = template_key(template)
    if key in seen_templates:
        return False
    seen_templates.add(key)
    templates.append(template)
    return True
