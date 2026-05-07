# Lumen Vulnerability Scanner

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Queue%20%2B%20PubSub-DC382D?logo=redis&logoColor=white)

A small hybrid DAST + client-side SAST web application security scanner built for coursework and demos.

- Web UI to create scans and view reports
- Node/Express API + MongoDB for storage
- Redis/Bull for background jobs
- Python worker runs bounded crawling, active DAST probes, optional client-side static analysis, and publishes progress/results

Important: only scan targets you own or have explicit permission to test.

## Scanner coverage

Lumen performs bounded crawling of the target site, runs active HTTP-focused DAST probes, and can statically inspect discovered client-side assets. Scan modules include examples such as `headers`, `cookies`, `xss`, `sqli`, and `client_sast`; coverage is intentionally bounded and should not be treated as exhaustive.

## Tech stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js (Express)
- Data: MongoDB
- Queue + pub/sub: Redis (Bull)
- Worker: Python (requests, BeautifulSoup, dnspython, redis)

## Architecture

```
Browser (React UI)
  │
  │ HTTP (JSON) + SSE (progress)
  ▼
Backend API (Express)
  │
  │ Bull queue + Redis pub/sub
  ▼
Python worker
```

## Repository layout

```text
backend/    Express API + queue worker + reporting
frontend/   React UI
python/     Scan worker
start-all.js
```

See service-specific docs:
- `backend/README.md`
- `frontend/README.md`
- `python/README.md`

## Quick start (local)

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB
- Redis

### Install

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../python && python -m pip install -r requirements.txt
```

### Configure backend

```bash
cd backend
cp .env.example .env
```

Set `JWT_SECRET` and confirm `MONGODB_URI` / `REDIS_URL`.

### Run everything

From the repo root:

```bash
node start-all.js
```

If your setup uses a dedicated backend queue worker process:

```bash
node start-all.js --with-backend-worker
```

Open: `http://localhost:5173`

## API key (automation / API-only mode)

The backend exposes an API-key protected interface under:

- `POST /api/publicApi/scans`
- `GET /api/publicApi/scans`
- `GET /api/publicApi/scans/:id`
- `GET /api/publicApi/scans/:id/report`
- `GET /api/publicApi/scans/:id/report.pdf`
- schedules: `POST/GET/DELETE /api/publicApi/schedules`

Set `PUBLIC_API_KEY` in `backend/.env`, then call:

```bash
curl -sS http://localhost:4000/api/publicApi/scans \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target":"https://example.com","modules":["headers","cookies"]}'
```

## Learn page images

You can add header images to the learning cards by dropping files into:

- `frontend/public/learn/`

Name them by slug (png/jpg/jpeg). Examples:

- `frontend/public/learn/sqli.png`
- `frontend/public/learn/xss.jpg`

## Verification (recommended)

After pulling changes, run:

```bash
cd frontend && npm run build
cd ../backend && node --check src/index.js && node --check src/queue/index.js
```

Then run a scan end-to-end with Redis + MongoDB running.

## License

No license file is included by default. If you plan to publish this project, add a `LICENSE` file (e.g. MIT) and update this section.
