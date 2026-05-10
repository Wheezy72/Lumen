import urllib.parse
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

from .browser_discovery import browser_discover_templates
from .config import (
    API_PATH_RE,
    BROWSER_DISCOVERY_ENABLED,
    BROWSER_DISCOVERY_MAX_REQUESTS,
    BROWSER_DISCOVERY_TIMEOUT_MS,
    MAX_CRAWL_DEPTH,
    MAX_CRAWL_PAGES,
    MAX_SCRIPT_FETCHES,
    REQUEST_TIMEOUT,
)
from .templates import (
    add_template,
    is_crawlable_url,
    is_same_origin,
    iter_input_fields,
    make_get_template,
    normalize_url,
    template_key,
    template_to_url,
)


def should_run_browser_discovery(page_count: int, form_count: int, script_count: int, api_count: int) -> bool:
    if BROWSER_DISCOVERY_ENABLED in ("0", "false", "off", "no"):
        return False
    if BROWSER_DISCOVERY_ENABLED in ("1", "true", "on", "yes"):
        return True
    return script_count > 0 and api_count == 0 and (page_count <= 3 or form_count == 0)


def under_page_limit(count: int) -> bool:
    return MAX_CRAWL_PAGES <= 0 or count < MAX_CRAWL_PAGES


def input_default_value(inp) -> str:
    inp_type = inp.get("type", "text").strip().lower()

    if inp_type == "submit":
        return inp.get("value", "Submit")
    if inp_type == "password":
        return inp.get("value", "Password123!")
    if inp_type in ("number", "range"):
        return inp.get("value", "1")
    if inp_type in ("email",):
        return inp.get("value", "test@example.com")
    if inp_type in ("url",):
        return inp.get("value", "https://example.com")
    return inp.get("value", "test")


def extract_form_template(form, page_url: str) -> Optional[Dict]:
    action = form.get("action", "").strip()
    method = form.get("method", "get").strip().upper()
    if method not in ("GET", "POST"):
        method = "GET"

    form_url = normalize_url(urllib.parse.urljoin(page_url, action) if action else page_url)
    parsed = urllib.parse.urlparse(form_url)
    base_url = urllib.parse.urlunparse(parsed._replace(query=""))
    params = {
        key: values[0] if values else ""
        for key, values in urllib.parse.parse_qs(parsed.query, keep_blank_values=True).items()
    }
    data: Dict[str, str] = {}

    for inp in form.find_all(["input", "textarea", "select"]):
        name = inp.get("name", "").strip()
        if not name:
            continue

        tag_name = inp.name.lower()
        inp_type = inp.get("type", "text").strip().lower()

        if inp_type in ("radio", "checkbox") and inp.get("checked") is None:
            continue

        if tag_name == "textarea":
            value = inp.get_text(strip=True) or "test"
        elif tag_name == "select":
            selected = inp.find("option", selected=True) or inp.find("option")
            value = selected.get("value", selected.get_text(strip=True)) if selected else "test"
        else:
            value = input_default_value(inp)

        data[name] = value

    for btn in form.find_all("button"):
        btn_type = btn.get("type", "submit").strip().lower()
        name = btn.get("name", "").strip()
        if btn_type == "submit" and name:
            data[name] = btn.get("value", btn.get_text(strip=True) or "Submit")

    if not data:
        return None

    if method == "GET":
        params.update(data)
        data = {}

    return {
        "method": method,
        "url": base_url,
        "params": params,
        "data": data,
        "json": {},
        "headers": {},
        "source": "form",
    }


def extract_api_templates_from_text(text: str, page_url: str, base_url: str) -> List[Dict]:
    templates: List[Dict] = []
    seen: set = set()

    for match in API_PATH_RE.finditer(text or ""):
        path = match.group("path")
        if not path or path.startswith("//"):
            continue

        full = normalize_url(urllib.parse.urljoin(page_url, path))
        if not is_same_origin(full, base_url) or not is_crawlable_url(full):
            continue

        template = make_get_template(full, source="script")
        key = template_key(template)
        if key not in seen:
            seen.add(key)
            templates.append(template)

    return templates


def crawl_site(base_url: str, headers: Optional[Dict] = None) -> Dict:
    """
    Recursively crawl same-origin HTML pages and build request templates.

    The crawler stays deliberately bounded so normal scans remain fast and
    predictable while still discovering deeper authenticated pages and forms.
    """
    start_url = normalize_url(base_url)
    queue: List[Tuple[str, int]] = [(start_url, 0)]
    seen_pages: set = set()
    seen_templates: set = set()
    pages: List[str] = []
    templates: List[Dict] = []
    forms_discovered = 0
    scripts_fetched = 0
    api_templates_discovered = 0

    while queue and under_page_limit(len(seen_pages)):
        current_url, depth = queue.pop(0)
        current_url = normalize_url(current_url)

        if current_url in seen_pages:
            continue
        if not is_same_origin(current_url, start_url) or not is_crawlable_url(current_url):
            continue

        seen_pages.add(current_url)
        pages.append(current_url)

        page_template = make_get_template(current_url, source="page")
        add_template(templates, seen_templates, page_template)

        try:
            resp = requests.get(current_url, timeout=REQUEST_TIMEOUT, headers=headers)
        except Exception as e:
            print(f"Auto-crawl request error for {current_url}: {e}")
            continue

        content_type = resp.headers.get("Content-Type", "").lower()
        if "html" not in content_type and "<html" not in resp.text[:500].lower():
            continue

        soup = BeautifulSoup(resp.text, "lxml")

        for form in soup.find_all("form"):
            form_template = extract_form_template(form, current_url)
            if not form_template:
                continue
            if not is_same_origin(form_template["url"], start_url):
                continue

            forms_discovered += 1
            add_template(templates, seen_templates, form_template)

        for api_template in extract_api_templates_from_text(resp.text, current_url, start_url):
            if add_template(templates, seen_templates, api_template):
                api_templates_discovered += 1

        for script in soup.find_all("script", src=True):
            if scripts_fetched >= MAX_SCRIPT_FETCHES:
                break

            src = script["src"].strip()
            if not src:
                continue

            script_url = normalize_url(urllib.parse.urljoin(current_url, src))
            if not is_same_origin(script_url, start_url):
                continue

            try:
                script_resp = requests.get(script_url, timeout=REQUEST_TIMEOUT, headers=headers)
            except Exception:
                continue

            scripts_fetched += 1
            for api_template in extract_api_templates_from_text(script_resp.text, script_url, start_url):
                if add_template(templates, seen_templates, api_template):
                    api_templates_discovered += 1

        if depth >= MAX_CRAWL_DEPTH:
            continue

        for tag in soup.find_all("a", href=True):
            href = tag["href"].strip()
            if not href or href.startswith("#") or href.startswith(("javascript:", "mailto:", "tel:")):
                continue

            full = normalize_url(urllib.parse.urljoin(current_url, href))
            if full in seen_pages:
                continue
            if not is_same_origin(full, start_url) or not is_crawlable_url(full):
                continue

            link_template = make_get_template(full, source="link")
            add_template(templates, seen_templates, link_template)

            if MAX_CRAWL_PAGES <= 0 or len(seen_pages) + len(queue) < MAX_CRAWL_PAGES:
                queue.append((full, depth + 1))

    browser_templates_discovered = 0
    browser_discovery_error = None
    if should_run_browser_discovery(len(pages), forms_discovered, scripts_fetched, api_templates_discovered):
        try:
            browser_result = browser_discover_templates(
                start_url,
                headers=headers,
                timeout_ms=BROWSER_DISCOVERY_TIMEOUT_MS,
                max_requests=BROWSER_DISCOVERY_MAX_REQUESTS,
            )
            browser_discovery_error = browser_result.get("error")
            for browser_template in browser_result.get("templates", []):
                if add_template(templates, seen_templates, browser_template):
                    browser_templates_discovered += 1
        except Exception as e:
            browser_discovery_error = str(e)

    stats = {
        "pages_crawled": len(pages),
        "forms_discovered": forms_discovered,
        "request_templates": len(templates),
        "api_templates_discovered": api_templates_discovered,
        "scripts_fetched": scripts_fetched,
        "browser_templates_discovered": browser_templates_discovered,
        "browser_discovery_error": browser_discovery_error,
        "input_fields": sum(len(iter_input_fields(template)) for template in templates),
        "max_pages": MAX_CRAWL_PAGES,
        "max_depth": MAX_CRAWL_DEPTH,
    }

    return {"pages": pages, "templates": templates, "stats": stats}


def auto_crawl_targets(base_url: str, headers: Optional[Dict] = None) -> List[str]:
    """
    Compatibility wrapper for URL-based modules.

    New code should use crawl_site() and request templates directly.
    """
    crawl = crawl_site(base_url, headers)
    targets = []
    seen = set()
    for template in crawl["templates"]:
        if str(template.get("method", "GET")).upper() != "GET":
            continue
        target = template_to_url(template)
        if target not in seen:
            seen.add(target)
            targets.append(target)
    return targets or [base_url]
