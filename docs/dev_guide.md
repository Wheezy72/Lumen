# Lumen Developer Guide

## Overview

Lumen is a small web application vulnerability scanner:

- **frontend/**: React + Vite UI
- **backend/**: Express API + MongoDB + Redis/Bull + authenticated SSE
- **python/**: Worker that performs HTTP-based checks and returns findings via Redis pub/sub

## Local development

Prereqs: Node.js 18+, Python 3, MongoDB, Redis.

Run each service in its own terminal.

1. Start MongoDB + Redis.
2. Start the backend API:

```bash
cd backend
npm install
cp .env.example .env
# Ensure at least MONGODB_URI, REDIS_URL and JWT_SECRET are set appropriately.
npm run dev
```

3. Start the Python worker:

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: allow scanning public targets (default is false)
# export ALLOW_EXTERNAL=true

python worker.py
```

4. Start the frontend (Vite dev server proxies `/api` -> `http://localhost:4000`):

```bash
cd frontend
npm install
npm run dev
```

## Auth & Security

### Cookies (names configurable via env)

- **Access token cookie**: HTTP-only JWT cookie named by `SESSION_COOKIE_NAME` (default: `session`).
- **Refresh token cookie**: HTTP-only cookie named by `REFRESH_COOKIE_NAME` (default: `refresh`).
  - Refresh tokens are stored server-side as a **hash** in the `Session` collection and are rotated on refresh.

### Refresh flow (`POST /api/auth/refresh`)

- Rotates the refresh token and re-sets cookies. Returns `{ ok: true }` on success.
- Expects both access-token and refresh-token cookies to be present.

### Session management

- `GET /api/auth/sessions` lists sessions for the current user.
- `DELETE /api/auth/sessions/:id` revokes a specific session.
- `POST /api/auth/logout` revokes the current session (best-effort) and clears auth cookies.
- `POST /api/auth/logout-all` revokes all sessions for the current user and clears auth cookies.

### CSRF

- Backend sets a non-HTTP-only CSRF cookie named by `CSRF_COOKIE_NAME` (default: `csrf`) when missing.
- For authenticated state-changing requests (non-GET/HEAD/OPTIONS), the backend requires an `x-csrf-token` header that exactly matches the CSRF cookie value.
- The frontend configures an Axios interceptor that reads the `csrf` cookie and automatically sends `x-csrf-token`.
  - If you change `CSRF_COOKIE_NAME` from its default, update the frontend interceptor accordingly.

### 2FA (TOTP)

Endpoints:

- `POST /api/auth/2fa/setup` → returns `{ otpauthUrl, qrDataUrl }`
- `POST /api/auth/2fa/verify` → verifies code and enables TOTP
- `POST /api/auth/2fa/disable` → verifies code and disables TOTP

Login when TOTP is enabled is a two-step flow:

- `POST /api/auth/login` returns `{ requiresTwoFactor: true, tempToken }`
- `POST /api/auth/login/2fa` completes login with `{ tempToken, code }`

Environment:

- `TOTP_ENCRYPTION_KEY`: 32-byte base64 key used to encrypt TOTP secrets at rest.
- `TOTP_ISSUER`: label shown in authenticator apps (default: `Lumen Scanner`).

### Rate limiting & lockout (high level)

- Login and registration endpoints are rate-limited (`express-rate-limit`; Redis-backed outside tests).
- Failed login attempts are tracked and can trigger temporary account lockout (Redis-backed outside tests).

### SSE (scan updates)

- SSE endpoint: `GET /api/sse/events`
- Requires authentication (cookie session).
- The backend filters scan events by `userId` and sends periodic heartbeat pings to keep connections alive.

## Scan policy / SSRF guardrails

Lumen applies strict target validation by default.

### Backend target policy (`ALLOW_PRIVATE_TARGETS`)

When creating scans, the backend:

- only allows `http`/`https`
- rejects URLs containing credentials (`username:password@host`)
- resolves DNS and rejects targets that resolve to private/internal ranges unless `ALLOW_PRIVATE_TARGETS=true`

### Python worker policy (`ALLOW_EXTERNAL`, `ALLOW_PRIVATE_TARGETS`)

- `ALLOW_EXTERNAL` (default: `false`): blocks scanning public/external targets unless explicitly enabled.
- `ALLOW_PRIVATE_TARGETS` (default: `false`): blocks private targets unless explicitly enabled.

### Safe request wrapper + URL validation

- The worker performs outbound HTTP requests via `python/utils/safe_request.py`.
- `python/utils/url_validator.py`:
  - only allows http/https
  - rejects userinfo in URLs
  - resolves DNS
  - blocks localhost, link-local ranges, and cloud metadata endpoints (e.g. `169.254.169.254`)
  - re-validates each redirect hop when redirects are enabled

## Configuration

See `backend/.env.example` for the full set of environment variables. Commonly used values during local dev are:

- `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`
- `ACCESS_TOKEN_TTL`, cookie name vars (`SESSION_COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `CSRF_COOKIE_NAME`)
- `TOTP_ENCRYPTION_KEY`, `TOTP_ISSUER`
- `ALLOW_PRIVATE_TARGETS`

Worker env vars are read from the process environment (e.g. `REDIS_URL`, `ALLOW_EXTERNAL`, `ALLOW_PRIVATE_TARGETS`).

## Testing & CI

- Backend tests: `cd backend && npm test`
- Frontend build: `cd frontend && npm run build`

GitHub Actions runs both (see `.github/workflows/ci.yml`) on pushes and pull requests.
