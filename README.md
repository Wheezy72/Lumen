# Lumen Vulnerability Scanner

Lumen is a lightweight vulnerability scanner for web applications.

It’s designed for coursework and small projects where you want a clear, practical report without the overhead of commercial tooling.

## What it does
- Starts scans from a simple web UI (React).
- Runs a small set of HTTP-focused checks in a Python worker (XSS, SQLi error hints, headers, cookies, etc.).
- Stores results in MongoDB and streams progress to the UI (SSE).
- Exports reports as PDF or CSV.

## Stack
- Frontend: React + Vite + Tailwind
- Backend: Node.js (Express), MongoDB, Redis (Bull queue)
- Worker: Python (requests, BeautifulSoup, dnspython, redis)

## Important note
Only scan targets you own or have explicit permission to test.

---

## Architecture (high level)

```
Frontend (React)
   │
   │ HTTP + JSON
   ▼
Backend API (Express)
   │
   │ Bull queue + Redis pub/sub
   ▼
Python worker (scan engine)
```

---

## Quick start

### Prerequisites
- Node.js 18+
- MongoDB
- Redis

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Python worker
```bash
cd python
python worker.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## API-only mode (no web UI)

1) Set `PUBLIC_API_KEY` in `backend/.env`.

2) Start backend + worker.

3) Call the API:
```bash
curl -sS http://localhost:4000/api/publicApi/scans \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target":"https://example.com","modules":["headers","cookies"]}'
```

---

## Project structure

```text
backend/    Express API + queue + reporting
frontend/   React UI
python/     Scan worker
docs/       Developer notes
```

---

## License
MIT (see `LICENSE`).