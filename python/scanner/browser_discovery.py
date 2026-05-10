import urllib.parse
import json
from typing import Dict, List, Optional

from .config import (
    BROWSER_BLOCKED_LABEL_HINTS,
    BROWSER_INTERACTION_WAIT_MS,
    BROWSER_MAX_INTERACTIONS,
    BROWSER_SAFE_LABEL_HINTS,
)


def _is_safe_label(label: str) -> bool:
    text = (label or "").strip().lower()
    if not text or len(text) > 64:
        return False
    if any(bad in text for bad in BROWSER_BLOCKED_LABEL_HINTS):
        return False
    if any(good in text for good in BROWSER_SAFE_LABEL_HINTS):
        return True
    # Allow short labels that look like navigation chips/links.
    return len(text) <= 24 and not any(ch in text for ch in "?$#@%")


def browser_discover_templates(
    base_url: str,
    headers: Optional[Dict] = None,
    timeout_ms: int = 12000,
    max_requests: int = 40,
    max_interactions: Optional[int] = None,
) -> Dict:
    """
    Use a headless browser to discover same-origin requests made by JS apps.

    This module is optional: if Playwright or browser binaries are not installed,
    the caller receives an error string and can continue with normal crawling.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        return {
            "templates": [],
            "stats": {"browser_requests": 0, "browser_interactions": 0},
            "error": f"Playwright unavailable: {e}",
        }

    parsed_base = urllib.parse.urlparse(base_url)
    captured: List[Dict] = []
    seen = set()

    def same_origin(url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and parsed.netloc == parsed_base.netloc

    def capture_request(request) -> None:
        if len(captured) >= max_requests:
            return

        url = request.url
        if not same_origin(url):
            return

        method = request.method.upper()
        if method not in ("GET", "POST"):
            return

        parsed = urllib.parse.urlparse(url)
        clean_url = urllib.parse.urlunparse(parsed._replace(query="", fragment=""))
        params = {
            key: values[0] if values else ""
            for key, values in urllib.parse.parse_qs(parsed.query, keep_blank_values=True).items()
        }

        data = {}
        post_data = request.post_data or ""
        content_type = request.headers.get("content-type", "")
        json_body = {}
        if method == "POST":
            if "application/x-www-form-urlencoded" in content_type:
                data = {
                    key: values[0] if values else ""
                    for key, values in urllib.parse.parse_qs(post_data, keep_blank_values=True).items()
                }
            elif "application/json" in content_type and post_data:
                try:
                    parsed_json = json.loads(post_data)
                    if isinstance(parsed_json, dict):
                        json_body = {
                            key: str(value) if value is not None else ""
                            for key, value in parsed_json.items()
                            if isinstance(value, (str, int, float, bool)) or value is None
                        }
                except Exception:
                    json_body = {}

        key = (method, clean_url, tuple(sorted(params.items())), tuple(sorted(data.items())), tuple(sorted(json_body.items())))
        if key in seen:
            return

        seen.add(key)
        captured.append({
            "method": method,
            "url": clean_url,
            "params": params,
            "data": data,
            "json": json_body,
            "headers": {},
            "source": "browser",
        })

    interactions_done = 0
    interaction_cap = max_interactions if max_interactions is not None else BROWSER_MAX_INTERACTIONS

    def perform_safe_interactions(page) -> None:
        nonlocal interactions_done
        if interaction_cap <= 0:
            return

        try:
            elements = page.query_selector_all("a, button, [role='link'], [role='button'], [role='tab']")
        except Exception:
            return

        clicked_labels: set = set()
        for element in elements:
            if interactions_done >= interaction_cap:
                return
            if len(captured) >= max_requests:
                return

            try:
                if not element.is_visible() or not element.is_enabled():
                    continue
                label = (element.inner_text() or element.get_attribute("aria-label") or "").strip()
            except Exception:
                continue

            if not _is_safe_label(label) or label.lower() in clicked_labels:
                continue

            clicked_labels.add(label.lower())

            try:
                element.click(timeout=2000, no_wait_after=True)
                interactions_done += 1
                page.wait_for_timeout(BROWSER_INTERACTION_WAIT_MS)
            except Exception:
                continue

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(extra_http_headers=headers or {})
            page = context.new_page()
            page.on("request", capture_request)
            page.goto(base_url, wait_until="networkidle", timeout=timeout_ms)
            perform_safe_interactions(page)
            browser.close()
    except Exception as e:
        return {
            "templates": captured,
            "stats": {"browser_requests": len(captured), "browser_interactions": interactions_done},
            "error": str(e),
        }

    return {
        "templates": captured,
        "stats": {"browser_requests": len(captured), "browser_interactions": interactions_done},
        "error": None,
    }
