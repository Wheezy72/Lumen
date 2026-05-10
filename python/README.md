# Python worker

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-PubSub-DC382D?logo=redis&logoColor=white)

The Python worker is the scan engine. It listens for jobs on Redis and publishes progress + results back to the Node backend.

## Layout

```text
worker.py                 Redis entrypoint and scan job orchestration
scanner/config.py         Scanner environment settings and shared constants
scanner/templates.py      Request-template helpers
scanner/findings.py       Finding fingerprints and normalization
scanner/crawler.py        Static crawler, form extraction, script/API discovery
scanner/browser_discovery.py
                          Optional Playwright network discovery
scanner/engine.py         Module selection and progress accounting
scanner/modules/          Individual check modules
```

Checks are split by concern so new modules can be added without growing `worker.py`.

The scanner mutates query parameters, form fields, and flat top-level JSON request bodies through the shared request-template helpers. Findings are normalized with stable fingerprints before they are returned so repeated findings can be deduplicated consistently.

## Install

```bash
cd python
python -m pip install -r requirements.txt
```

Optional browser-based discovery for JavaScript-heavy apps uses Playwright.
After installing Python requirements, install Chromium once:

```bash
python -m playwright install chromium
```

## Run

```bash
cd python
python worker.py
```

## Configuration (environment variables)

- `REDIS_URL` (default: `redis://127.0.0.1:6379`)
- `LUMEN_MAX_CRAWL_PAGES` (default: `30`, set `0` for no page cap)
- `LUMEN_MAX_CRAWL_DEPTH` (default: `2`)
- `LUMEN_REQUEST_TIMEOUT` (default: `8`)
- `LUMEN_MAX_SCRIPT_FETCHES` (default: `8`)
- `LUMEN_BROWSER_DISCOVERY` (default: `auto`; use `on`/`off` to force/disable Playwright discovery)
- `LUMEN_BROWSER_DISCOVERY_TIMEOUT_MS` (default: `12000`)
- `LUMEN_BROWSER_DISCOVERY_MAX_REQUESTS` (default: `40`)
- `LUMEN_BROWSER_MAX_INTERACTIONS` (default: `12`, set `0` to skip interactions)
- `LUMEN_BROWSER_INTERACTION_WAIT_MS` (default: `700`)
- `LUMEN_SAST_MAX_FILE_BYTES` (default: `1000000`)
- `LUMEN_SAST_MAX_TOTAL_BYTES` (default: `50000000`)
- `LUMEN_SAST_MAX_FILES` (default: `5000`)
- `LUMEN_SAST_MAX_FINDINGS_PER_RULE` (default: `20`)

Scanner modules:

- `headers` — missing browser/security headers
- `cookies` — weak `Set-Cookie` flags
- `tls` — TLS handshake/protocol checks
- `exposure` — exposed config, Git metadata, backups, debug files
- `cors` — unsafe credentialed CORS policies
- `redirect` — open redirects through redirect-like parameters
- `xss` — reflected XSS through discovered inputs
- `sqli` — SQL error-based injection through discovered inputs
- `traversal` — path traversal/local file inclusion probes
- `command_injection` — command-like fields with harmless echo markers
- `csrf` — state-changing POST forms without obvious CSRF tokens
- `subdomain` — small common subdomain resolver
- `error` — verbose errors/stack traces
- `access_control` — ID-like field mutation, path-segment IDOR probes, and authenticated/unauthenticated differential when auth headers are supplied
- `rate_limit` — missing throttling on auth-like endpoints
- `sast` — lightweight local source scan for secrets, risky code patterns, and dependency hygiene; runs only when `sourcePath` is supplied on the scan request

Heartbeat (used by the backend to fail fast if the worker is offline):

- `PY_WORKER_HEARTBEAT_KEY` (default: `scanner:python_worker:heartbeat`)
- `PY_WORKER_HEARTBEAT_TTL_SECONDS` (default: `15`)
- `PY_WORKER_HEARTBEAT_INTERVAL_SECONDS` (default: `5`)

## Redis channels

- job channel: `scan_jobs`
- result channel: `scan_results`

Messages on `scan_results` include:

- progress: `{ scanId, type: "progress", progress }`
- result: `{ scanId, results: [...] }`
- error: `{ scanId, type: "error", error }`
