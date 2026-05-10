# Lumen Vulnerability Scanner

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Queue%20%2B%20PubSub-DC382D?logo=redis&logoColor=white)

A small web application security scanner built for coursework and demos.

- Web UI to create scans and view reports
- Node/Express API + MongoDB for storage
- Redis/Bull for background jobs
- Python worker runs HTTP-focused checks and publishes progress/results

Important: only scan targets you own or have explicit permission to test.

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
postman/    Postman JSON collection for the Public API
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

Set `PUBLIC_API_KEY` in `backend/.env`.

A ready-to-use Postman collection is included at `postman/Lumen-Public-API.postman_collection.json`. Import it into Postman to test all Public API endpoints — it covers creating scans, polling status, fetching JSON reports, and downloading PDF reports.

## Learn page images

You can add header images to the learning cards by dropping files into:

- `frontend/public/learn/`

Name them by slug (png/jpg/jpeg). Examples:

- `frontend/public/learn/sqli.png`
- `frontend/public/learn/xss.jpg`

## Verification (recommended)

I can review and edit files here, but I can’t run your local environment. After pulling changes, run:

```bash
cd frontend && npm run build
cd ../backend && node --check src/index.js && node --check src/queue/index.js
```

Then run a scan end-to-end with Redis + MongoDB running.

## License

MIT License

Copyright (c) 2026 Lumen Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.