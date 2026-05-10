# Python worker

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-PubSub-DC382D?logo=redis&logoColor=white)

The Python worker is the scan engine. It listens for jobs on Redis and publishes progress + results back to the Node backend.

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
