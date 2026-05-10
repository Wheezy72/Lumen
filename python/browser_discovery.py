import urllib.parse
from typing import Dict, List, Optional


def browser_discover_templates(
    base_url: str,
    headers: Optional[Dict] = None,
    timeout_ms: int = 12000,
    max_requests: int = 40,
) -> Dict:
    """
    Use a headless browser to discover same-origin requests made by JS apps.

    This module is optional: if Playwright or browser binaries are not installed,
    the caller receives an error string and can continue with normal crawling.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        return {"templates": [], "stats": {"browser_requests": 0}, "error": f"Playwright unavailable: {e}"}

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
        if method == "POST" and "application/x-www-form-urlencoded" in content_type:
            data = {
                key: values[0] if values else ""
                for key, values in urllib.parse.parse_qs(post_data, keep_blank_values=True).items()
            }

        key = (method, clean_url, tuple(sorted(params.items())), tuple(sorted(data.items())))
        if key in seen:
            return

        seen.add(key)
        captured.append({
            "method": method,
            "url": clean_url,
            "params": params,
            "data": data,
            "headers": {},
            "source": "browser",
        })

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(extra_http_headers=headers or {})
            page = context.new_page()
            page.on("request", capture_request)
            page.goto(base_url, wait_until="networkidle", timeout=timeout_ms)
            browser.close()
    except Exception as e:
        return {"templates": captured, "stats": {"browser_requests": len(captured)}, "error": str(e)}

    return {"templates": captured, "stats": {"browser_requests": len(captured)}, "error": None}
