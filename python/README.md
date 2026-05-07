# Python worker

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-PubSub-DC382D?logo=redis&logoColor=white)

The Python worker is the scan engine. It listens for jobs on Redis and publishes progress + results back to the Node backend. It performs bounded crawling, active HTTP-focused DAST probes, and optional client-side static analysis when the `client_sast` module is selected.

## Install

```bash
cd python
python -m pip install -r requirements.txt
```

## Run

```bash
cd python
python worker.py
```

## Configuration (environment variables)

- `REDIS_URL` (default: `redis://127.0.0.1:6379`)

## Scan modules

Jobs can select scan modules such as `headers`, `cookies`, `xss`, `sqli`, and `client_sast`. The `client_sast` module statically inspects discovered JavaScript, source maps, potential secrets, and DOM sinks as a client-side companion to the active DAST checks.

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
