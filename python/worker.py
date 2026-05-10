import os
import json
import threading
import urllib.parse
from typing import List, Dict, Optional

import redis

from scanner.config import ORIGIN_LEVEL_MODULES
from scanner.crawler import crawl_site
from scanner.engine import run_scan
from scanner.findings import normalize_finding
from scanner.templates import iter_input_fields, make_get_template, template_to_url


"""
Python worker for the scanner.

This process listens for scan jobs on Redis, runs a set of HTTP-focused
checks against the site, and publishes the findings back to the Node.js backend.
"""

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

JOB_CHANNEL = "scan_jobs"
RESULT_CHANNEL = "scan_results"

HEARTBEAT_KEY = os.getenv("PY_WORKER_HEARTBEAT_KEY", "scanner:python_worker:heartbeat")
HEARTBEAT_TTL_SECONDS = int(os.getenv("PY_WORKER_HEARTBEAT_TTL_SECONDS", "15"))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("PY_WORKER_HEARTBEAT_INTERVAL_SECONDS", "5"))

redis_client = redis.Redis.from_url(REDIS_URL)


def send_results(scan_id: str, issues: List[Dict]) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "results": issues}),
    )


def send_progress(scan_id: str, progress: int) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "type": "progress", "progress": progress}),
    )


def send_error(scan_id: str, error: str) -> None:
    redis_client.publish(
        RESULT_CHANNEL,
        json.dumps({"scanId": scan_id, "type": "error", "error": error}),
    )


def heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            redis_client.set(HEARTBEAT_KEY, "1", ex=HEARTBEAT_TTL_SECONDS)
        except Exception as e:
            print(f"Heartbeat error: {e}")
        stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)


# --- Entry point ---------------------------------------------------------------



def parse_job_payload(message: Dict) -> Dict:
    raw = message.get("data")
    if raw is None:
        return {}

    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return {}

    request_headers = payload.get("requestHeaders")
    if not isinstance(request_headers, dict):
        request_headers = None

    return {
        "scan_id": payload.get("scanId"),
        "target_url": payload.get("targetUrl"),
        "scan_profile": payload.get("scanProfile"),
        "request_headers": request_headers,
    }


def build_coverage_summary(stats: Dict, request_headers: Optional[Dict], modules: Optional[List[str]]) -> Dict:
    auth_supplied = bool(request_headers)
    modules_run = ", ".join(modules) if modules else "default"
    max_pages = stats.get("max_pages", 0)
    max_pages_label = "unlimited" if max_pages == 0 else str(max_pages)
    return {
        "title": "Scan coverage summary",
        "severity": "info",
        "description": (
            f"Crawled {stats.get('pages_crawled', 0)} page(s), discovered "
            f"{stats.get('forms_discovered', 0)} form(s), and built "
            f"{stats.get('request_templates', 0)} request template(s) with "
            f"{stats.get('input_fields', 0)} testable input field(s)."
        ),
        "evidence": (
            f"Auth headers supplied: {'yes' if auth_supplied else 'no'} | "
            f"API templates: {stats.get('api_templates_discovered', 0)} | "
            f"Scripts fetched: {stats.get('scripts_fetched', 0)} | "
            f"Browser templates: {stats.get('browser_templates_discovered', 0)} | "
            f"Max depth: {stats.get('max_depth', 0)} | "
            f"Max pages: {max_pages_label} | "
            f"Modules: {modules_run}"
        ),
        "category": "coverage",
    }


def process_job(message: Dict) -> None:
    job = parse_job_payload(message)

    scan_id = job.get("scan_id")
    target_url = job.get("target_url")
    scan_profile = job.get("scan_profile")
    request_headers = job.get("request_headers")

    if not target_url:
        print("Received job without a targetUrl, skipping.")
        if scan_id:
            send_error(scan_id, "Job missing targetUrl")
        return

    print(f"Processing scan {scan_id} for {target_url}")
    if scan_id:
        send_progress(scan_id, 5)

    # ── Auto-crawl: if the URL has no query string, discover same-origin pages
    #    and forms, then scan the resulting request templates. Active input
    #    checks now use template params/data, so POST forms are included.
    parsed = urllib.parse.urlparse(target_url)
    has_params = bool(parsed.query)

    if not has_params:
        print(f"  Auto-crawling {target_url} for request templates…")
        crawl = crawl_site(target_url, request_headers)
        templates = crawl["templates"]
        stats = crawl["stats"]

        if not templates:
            templates = [make_get_template(target_url, source="direct")]

        print(
            "  Crawl complete: "
            f"{stats['pages_crawled']} page(s), "
            f"{stats['forms_discovered']} form(s), "
            f"{stats['request_templates']} request template(s)."
        )
        print(f"  Scanning {len(templates)} request template(s).")

        if scan_id:
            send_progress(scan_id, 10)

        all_issues: List[Dict] = []
        n = len(templates)
        completed_origin_modules: set = set()

        for i, template in enumerate(templates):
            # Divide the 10–95 progress range evenly across all templates
            p_start = 10 + int((i / n) * 85)
            p_end   = 10 + int(((i + 1) / n) * 85)
            method = str(template.get("method", "GET")).upper()
            print(f"  Scanning template {i + 1}/{n}: {method} {template_to_url(template)}")
            skip_modules = set(completed_origin_modules)
            issues = run_scan(
                template_to_url(template),
                scan_profile,
                scan_id,
                request_headers,
                progress_start=p_start,
                progress_end=p_end,
                template=template,
                skip_modules=skip_modules,
                progress_callback=send_progress,
            )
            all_issues.extend(issues)
            if not skip_modules:
                completed_origin_modules.update(ORIGIN_LEVEL_MODULES)

        all_issues.append(build_coverage_summary(stats, request_headers, scan_profile))

        # De-duplicate by stable fingerprint first, falling back to the older
        # title/category/evidence tuple for any legacy finding shape.
        seen_keys: set = set()
        deduped: List[Dict] = []
        for issue in all_issues:
            issue = normalize_finding(issue)
            key = issue.get("fingerprint") or (issue.get("title", ""), issue.get("category", ""), issue.get("evidence", ""))
            if key not in seen_keys:
                seen_keys.add(key)
                deduped.append(issue)

        send_results(scan_id, deduped)
    else:
        # URL already has parameters — scan it directly.
        direct_template = make_get_template(target_url, source="direct")
        issues = run_scan(
            target_url,
            scan_profile,
            scan_id,
            request_headers,
            progress_start=10,
            progress_end=95,
            template=direct_template,
            progress_callback=send_progress,
        )
        direct_stats = {
            "pages_crawled": 1,
            "forms_discovered": 0,
            "request_templates": 1,
            "api_templates_discovered": 0,
            "scripts_fetched": 0,
            "browser_templates_discovered": 0,
            "browser_discovery_error": None,
            "input_fields": len(iter_input_fields(direct_template)),
            "max_pages": 1,
            "max_depth": 0,
        }
        issues.append(build_coverage_summary(direct_stats, request_headers, scan_profile))
        issues = [normalize_finding(issue) for issue in issues]
        send_results(scan_id, issues)


def run_worker_loop(stop_event: threading.Event) -> None:
    pubsub = redis_client.pubsub()
    pubsub.subscribe(JOB_CHANNEL)

    print("Python worker is running and waiting for scan jobs...")

    for message in pubsub.listen():
        if stop_event.is_set():
            return

        if message.get("type") != "message":
            continue

        try:
            process_job(message)
        except Exception as e:
            scan_id = None
            try:
                scan_id = parse_job_payload(message).get("scan_id")
            except Exception:
                scan_id = None

            print(f"Worker error: {e}")
            if scan_id:
                send_error(scan_id, str(e))


def main() -> None:
    stop_event = threading.Event()
    threading.Thread(target=heartbeat_loop, args=(stop_event,), daemon=True).start()
    run_worker_loop(stop_event)


if __name__ == "__main__":
    main()
