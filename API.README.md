# Lumen API README (how to test)

This project exposes two APIs:

1) **Web App API** (cookie/JWT session)
   - Used by the frontend dashboard.
   - Base path: `/api/...`

2) **Public API** (API key)
   - Designed for programmatic access without user accounts.
   - Base path: `/api/publicApi/...`

If you run the frontend with Vite, `/api` is proxied to the backend (`http://127.0.0.1:4000` by default).

---

## Base URLs

- Frontend (Vite): `http://localhost:5173`
- Backend API: `http://localhost:4000`

If you’re accessing from another device on your network, use the dev machine’s IP:
- Example frontend: `http://100.114.121.63:5173`
- Example backend: `http://100.114.121.63:4000`

### LAN testing checklist (phone / second laptop)

1) Start Vite with `host: true` (already configured).
2) Make sure Windows firewall allows inbound TCP to ports **5173** and **4000**.
3) In `backend/.env`, set one of:
   - `CORS_ORIGINS=*` (fastest for local testing), or
   - `CORS_ORIGINS=http://100.114.121.63:5173` (recommended if you want to be strict)
4) Keep `COOKIE_DOMAIN` **empty** for LAN/IP testing.

---

## Web App API (session auth)

### How auth works

- Login sets an **HttpOnly** cookie named `session`.
- Browser requests include it automatically.
- For `curl`/Postman, you must store/send cookies.

### 1) Register

```bash
curl -i http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"Str0ng!Pass"}'
```

### 2) Login (save cookie to cookies.txt)

```bash
curl -i -c cookies.txt http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"Str0ng!Pass"}'
```

### 3) Who am I? (uses saved cookies)

```bash
curl -i -b cookies.txt http://localhost:4000/api/auth/me
```

### 4) Start a scan

```bash
curl -i -b cookies.txt http://localhost:4000/api/scans \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl":"https://example.com",
    "scanProfile":["headers","xss","sqli"]
  }'
```

### 5) Start an authenticated scan (Cookie / Authorization headers)

These headers are forwarded to the Python worker and attached to every HTTP request it makes.

```bash
curl -i -b cookies.txt http://localhost:4000/api/scans \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl":"https://example.com/protected",
    "scanProfile":["headers","xss"],
    "authHeaders": {
      "cookie": "PHPSESSID=...; security=low",
      "authorization": "Bearer eyJ..."
    }
  }'
```

Notes:
- You can provide **either** `cookie` or `authorization` (or both).
- Lumen does not persist these headers to MongoDB (they only exist in the queued job payload).

### 6) List scans

```bash
curl -s -b cookies.txt http://localhost:4000/api/scans | head
```

### 7) Update your settings

```bash
curl -i -b cookies.txt http://localhost:4000/api/users/me \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","emailAlertsEnabled":true}'
```

### 8) Forgot password / Reset password

Send code (requires email to be configured):

```bash
curl -i http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
```

Reset:

```bash
curl -i http://localhost:4000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","code":"123456","password":"Str0ng!Pass2"}'
```

---

## Public API (API key auth)

### Does it need auth?

Yes.

The public API is protected by an API key:
- `Authorization: Bearer <PUBLIC_API_KEY>` **or**
- `X-API-Key: <PUBLIC_API_KEY>`

Set it in `backend/.env`:

```env
PUBLIC_API_KEY=replace_with_strong_random_key
```

### Safety: private targets are blocked by default

For SSRF safety, the public API blocks `localhost` and private IP ranges unless you explicitly allow them:

```env
ALLOW_PRIVATE_TARGETS=true
```

### 1) Start a public scan

```bash
curl -i http://localhost:4000/api/publicApi/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -d '{"target":"https://example.com","modules":["headers","xss"]}'
```

### 2) List public scans

```bash
curl -s http://localhost:4000/api/publicApi/scans \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

### 3) Get a scan

```bash
curl -s http://localhost:4000/api/publicApi/scans/<scanId> \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

### 4) Get a report JSON

```bash
curl -s http://localhost:4000/api/publicApi/scans/<scanId>/report \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

### 5) Download report files

```bash
curl -L -o report.pdf \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  http://localhost:4000/api/publicApi/scans/<scanId>/report.pdf

curl -L -o report.csv \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  http://localhost:4000/api/publicApi/scans/<scanId>/report.csv
```

---

## Quick troubleshooting

- If `POST /api/auth/forgot-password` returns `503`, email is not enabled/configured (`EMAIL_ENABLED=true` + SMTP settings).
- If public API returns `503`, `PUBLIC_API_KEY` is missing.
- If scans aren’t running, confirm Redis is up and the Python worker is running.
