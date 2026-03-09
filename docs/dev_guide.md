# Lumen Developer Guide

## Overview

Lumen is a small web application vulnerability scanner:

- **frontend/**: React + Vite UI
- **backend/**: Express API + MongoDB for persistence + Redis/Bull for job queue
- **python/**: Worker that performs HTTP-based security checks and returns findings

## Local development

1. Start MongoDB + Redis
2. Start backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

3. Start python worker:

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python worker.py
```

4. Start frontend:

```bash
cd frontend
npm install
npm run dev
```

## Security notes

- Backend sets security headers via Helmet and enforces request size limits.
- Auth uses HTTP-only cookies; cookie domain is optional (host-only on localhost).
- Login and registration are rate-limited.
- Registration enforces a stronger password policy and checks passwords against the HaveIBeenPwned range API.
- The Python worker uses an SSRF-safe HTTP client that blocks localhost/metadata endpoints and, by default, private IP ranges.

## Configuration

See `backend/.env.example` for all environment variables.

In the worker:

- `ALLOW_EXTERNAL` (default `false`): allow scanning public targets
- `ALLOW_PRIVATE_TARGETS` (default `false`): allow scanning RFC1918/ULA targets

Use `ALLOW_PRIVATE_TARGETS=true` only in self-hosted environments where you intentionally scan internal networks.
