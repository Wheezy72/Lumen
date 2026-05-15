# Backend (Express API)

![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=000)
![Node.js](https://img.shields.io/badge/Runtime-Node.js%2018%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Framework-Express-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/DB-MongoDB-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Queue-Redis-DC382D?logo=redis&logoColor=white)

The backend provides:

- Authentication (JWT in an httpOnly cookie)
- Scan orchestration (queue + pub/sub)
- Scan storage (MongoDB)
- Reporting endpoints (PDF/CSV)
- Server-Sent Events (SSE) for real-time progress

## Quick start

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

If you use a separate queue worker process:

```bash
npm run worker
```

## Configuration

Copy `backend/.env.example` to `backend/.env`.

The most important values:

- `MONGODB_URI`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `PUBLIC_API_KEY` (if using `/api/publicApi`)

Cookie/session behaviour:

- `COOKIE_SECURE=true` when served behind HTTPS
- `COOKIE_DOMAIN` should be a real domain in production (leave as `localhost` in local dev)

Security controls:

- Startup now enforces strong secrets (`JWT_SECRET`, and `PUBLIC_API_KEY` when set).
- Auth and Public API routes are rate limited per IP.
- Target URLs and webhook URLs are validated against private-network and host policy rules.
- Public API scans/schedules are isolated per API key identity.
- Sensitive actions are written to a tamper-evident audit log chain (`logs/audit.log`).

## Routes (high level)

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

User settings:

- `GET /api/users/me`
- `PUT /api/users/me` (username/email/emailAlertsEnabled)

Scans / reports:

- `GET /api/scans`
- `POST /api/scans`
- `GET /api/scans/:id`
- `GET /api/reports/:id/*` (report exports)

Live progress:

- `GET /api/sse/events` (EventSource)

Public API (API key auth):

- `POST /api/publicApi/scans`
- `GET /api/publicApi/scans`
- `GET /api/publicApi/scans/:id`
- `GET /api/publicApi/scans/:id/report(.pdf)`
- `POST/GET/DELETE /api/publicApi/schedules`

## How scan results arrive

The Python worker publishes:

- job messages on Redis channel `scan_jobs`
- progress/results on Redis channel `scan_results`

The backend consumes `scan_results`, updates the MongoDB `Scan` document, and pushes SSE events to connected clients.

## More detail

- `backend/OVERVIEW.md` contains a deeper architecture walkthrough.
