# Frontend (React UI)

![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=000)
![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Build-Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/CSS-Tailwind-06B6D4?logo=tailwindcss&logoColor=white)

This is the web UI for creating scans and reviewing results.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Vite runs on `http://localhost:5173` by default.

## Theme

- Theme is stored in `localStorage` under `lumen-theme`.
- The theme is applied early on page load to avoid flashing.

## Learn page images

The Learn page supports per-card header images.

Folder:

- `frontend/public/learn/`

Naming:

- Use the vulnerability slug + extension:
  - `sqli.png`
  - `xss.jpg`
  - `access_control.jpeg`

Supported extensions (auto fallback): `png`, `jpg`, `jpeg`.

## API connection

The UI calls the backend via the Vite proxy (see `vite.config.js`).

If you change the frontend port, remember to update `CORS_ORIGINS` in `backend/.env`.
