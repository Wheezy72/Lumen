# Backend overview (Lumen)

This folder contains the Node/Express API that powers the UI.

## Quick map

- `src/index.js`
  - Bootstraps the Express app
  - Configures security middleware (Helmet, CORS, cookies)
  - Connects to MongoDB
  - Sets up Bull (Redis) queue + recurring schedules
  - Mounts all routes under `/api/*`

- `src/routes/`
  - `auth.js`: username/password auth (JWT stored in an httpOnly cookie)
  - `users.js`: current-user profile + notification preferences (and username change)
  - `scans.js`: create scans, list scans, fetch scan results
  - `reports.js`: export results (PDF/CSV) and serve report assets
  - `sse.js`: live progress updates via Server-Sent Events (EventSource)
  - `publicApi.js`: API-key based endpoints (separate from normal login)

- `src/models/`
  - `User.js`: user accounts (username, password hash, optional email)
  - `Scan.js`: scan runs and their results
  - `RecurringScan.js`: saved scan schedules

- `src/queue/`
  - Bull (Redis-backed) job orchestration.
  - Handles scheduled/recurring scans and delegates work to the worker.

- `src/services/`
  - Higher-level business logic.
  - Examples:
    - `email.js`: sends summary/failure emails when alerts are enabled
    - `scanDiff.js`: computes "new vs fixed" changes between scans
    - `threatIntel.js`: enrichment helpers (CVEs/EPSS/etc)

- `src/middleware/`
  - `auth.js`: verifies the JWT cookie/bearer token and sets `req.user`
  - `apiKeyAuth.js`: verifies API keys for `/api/publicApi/*`
  - `error.js`: unified JSON error responses (Joi validation → 400)

## Core flows

### 1) Sign in

- `POST /api/auth/login`
  - Validates credentials
  - Signs a JWT: `{ id, username }`
  - Stores it in an httpOnly cookie (`session`)

### 2) Start a scan

- `POST /api/scans`
  - Stores a `Scan` document with status `queued`
  - Enqueues a Bull job

### 3) Progress updates

- Frontend opens: `GET /api/sse/events` (EventSource)
- Backend pushes events like `progress`, `completed`, `failed`
- UI refreshes scan lists/reports based on those events

### 4) Scan execution

- Bull job triggers the scanning worker (Python worker in `../python/worker.py`)
- Results are written back into MongoDB (`Scan.results`)

## Configuration

See `backend/.env.example`. Key variables:

- `MONGODB_URI`: Mongo connection string
- `PORT`: API port (default `4000`)
- `CORS_ORIGINS`: comma-separated allowed origins (for local dev, Vite uses `5173`)
- `JWT_SECRET`: required for signing sessions
- `COOKIE_SECURE`: set to `true` behind HTTPS
- `COOKIE_DOMAIN`: set when hosting on a real domain

## Notes when hosting

To get full functionality in production you typically need:

- Node backend (`backend`)
- Redis (Bull queue)
- MongoDB
- Python worker (`python/worker.py`)
- A reverse proxy for HTTPS (so cookies can be `secure`)
