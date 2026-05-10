# Lumen scanner developer guide

This guide is the source of truth for how the scanner works, where code lives, how to add checks, and which commands to run before shipping changes.

## Architecture

```text
React UI / Public API
  -> Express backend
  -> Redis/Bull queue
  -> Python worker
  -> scanner package
  -> results back through Redis
```

The Python worker is intentionally small. Scanner logic lives under `python/scanner`.

```text
python/
  worker.py                         Redis entrypoint and scan orchestration
  scanner/
    config.py                       Environment settings and module constants
    templates.py                    Request-template helpers
    crawler.py                      Static crawl, forms, scripts, API path discovery
    browser_discovery.py            Optional Playwright network discovery
    engine.py                       Module registry and execution loop
    modules/
      headers.py
      cookies.py
      tls.py
      exposure.py
      cors.py
      redirect.py
      xss.py
      sqli.py
      traversal.py
      command_injection.py
      csrf.py
      subdomain.py
      error_leakage.py
      access_control.py
      rate_limit.py
```

## Request templates

All active checks should operate on request templates instead of raw URLs.

```python
{
    "method": "POST",
    "url": "https://target.example/profile/update",
    "params": {},
    "data": {
        "email": "test@example.com",
        "Submit": "Save",
    },
    "json": {
        "displayName": "Alice"
    },
    "headers": {},
    "source": "form",
}
```

Template helpers live in:

```text
python/scanner/templates.py
```

Use these helpers instead of hand-editing templates:

- `make_get_template(url, source="direct")`
- `template_to_url(template)`
- `send_template(template, headers=None)`
- `clone_template(template)`
- `iter_input_fields(template)`
- `set_input_field(template, location, key, value)`
- `add_template(templates, seen_templates, template)`

`iter_input_fields()` returns fields from `params`, `data`, and flat top-level `json` bodies. Active modules should use it so JSON APIs, forms, and query strings are tested consistently.

Browser-discovered `application/json` POST requests are captured as flat JSON templates when their top-level values are strings, numbers, booleans, or null. Deeply nested JSON mutation is intentionally out of scope for now.

## Discovery flow

`scanner/crawler.py` does discovery in layers:

1. Same-origin recursive HTML crawl.
2. Link extraction.
3. GET/POST form extraction.
4. Inline JavaScript API path extraction.
5. Same-origin script fetches and API path extraction.
6. Optional Playwright browser network discovery.

Browser discovery is controlled by:

```env
LUMEN_BROWSER_DISCOVERY=auto
LUMEN_BROWSER_DISCOVERY_TIMEOUT_MS=12000
LUMEN_BROWSER_DISCOVERY_MAX_REQUESTS=40
LUMEN_BROWSER_MAX_INTERACTIONS=12
LUMEN_BROWSER_INTERACTION_WAIT_MS=700
```

Use `LUMEN_BROWSER_DISCOVERY=on` for SPA-heavy lab targets. Use `off` to disable browser discovery.

Bounded interactions click visible navigation-style elements after the initial page load to surface API requests that only fire on user actions. Interaction labels are filtered through allow/deny lists in `scanner/config.py` so destructive verbs (`delete`, `pay`, `logout`, `submit`, etc.) are skipped even on intentionally vulnerable apps.

## Current module IDs

```text
headers
cookies
tls
exposure
cors
redirect
xss
sqli
traversal
command_injection
csrf
subdomain
error
access_control
rate_limit
```

These IDs must stay in sync across:

- `python/scanner/engine.py`
- `frontend/src/pages/NewScan.jsx`
- `frontend/src/pages/ReportView.jsx`
- `backend/src/routes/publicApi/schemas.js`
- `others/API.README.md`

## Adding a new DAST module

1. Create a file:

```text
python/scanner/modules/my_check.py
```

2. Export a function that returns a list of finding dictionaries:

```python
from typing import Dict, List, Optional


def check_my_check_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    issues: List[Dict] = []
    return issues
```

3. Findings should use the standard shape:

```python
{
    "title": "Issue title",
    "severity": "medium",
    "description": "What the issue means.",
    "evidence": "Short proof or response marker.",
    "category": "my_check",
    "url": template.get("url"),
    "method": "GET",
    "parameter": "id",
    "payload": "test",
    "confidence": "confirmed",
    "fingerprint": "my_check:...",
}
```

You usually do not need to set `fingerprint` yourself. `scanner/findings.py` adds stable fingerprints centrally after modules return findings. Fingerprints are used for deduplication and should represent the root issue rather than the exact payload.

4. Wire it into:

```text
python/scanner/engine.py
```

5. Add it to the frontend module list:

```text
frontend/src/pages/NewScan.jsx
```

6. Add report labels/remediation:

```text
frontend/src/pages/ReportView.jsx
backend/src/utils/pdfReport.js
```

7. Add it to the public API validation schema:

```text
backend/src/routes/publicApi/schemas.js
```

8. Update public API docs:

```text
others/API.README.md
```

## Adding crawler behavior

Crawler behavior belongs in:

```text
python/scanner/crawler.py
```

Rules:

- stay same-origin unless explicitly designed otherwise
- skip static assets
- keep bounded defaults
- make deeper behavior configurable through `scanner/config.py`
- record coverage stats when adding a discovery layer

## Public API scan example

```bash
curl -i http://localhost:4000/api/publicApi/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -d '{
    "target": "https://example.com",
    "modules": ["headers", "exposure", "cors", "xss", "sqli"]
  }'
```

Authenticated target scan:

```bash
curl -i http://localhost:4000/api/publicApi/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -d '{
    "target": "https://example.com/protected",
    "modules": ["headers", "xss", "sqli", "csrf"],
    "requestHeaders": {
      "Cookie": "session=...",
      "Authorization": "Bearer eyJ..."
    }
  }'
```

## Commands to run

Python scanner syntax:

```bash
cd python
python -m py_compile worker.py scanner/*.py scanner/modules/*.py
```

Backend syntax:

```bash
cd backend
node --check src/routes/publicApi/schemas.js
node --check src/routes/publicApi/index.js
node --check src/routes/reports.js
```

Frontend build:

```bash
cd frontend
npm run build
```

Optional browser discovery setup:

```bash
cd python
python -m playwright install chromium
```

## Safety rules

- Only scan systems you own or have explicit permission to test.
- Keep active payloads harmless.
- Do not add destructive browser interactions.
- Do not brute-force credentials.
- Keep defaults bounded for large sites.
- Make expensive behavior opt-in through config.

## Sprint roadmap

Recommended next implementation order:

1. JSON API mutation and stable finding fingerprints.
2. Bounded Playwright interactions.
3. Deeper access-control differentials.
4. Lightweight local SAST checks.
