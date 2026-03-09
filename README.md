# Lumen Vulnerability Scanner

Lumen is a small, focused web application vulnerability scanner built for developers and students who cannot justify the cost or complexity of heavy commercial tools like Burp Suite or Nessus.

It gives you:

- A simple web UI to start scans and view results.
- A Python engine that runs practical checks (XSS, SQLi, headers, cookies, error leakage, etc.).
- PDF/CSV reports that explain **how** each issue was found and **how** to reduce the risk.

The stack:

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js (Express), MongoDB, Redis + Bull, SSE (behind auth)
- **Worker**: Python (requests, BeautifulSoup, dnspython, redis)

---

## Features

### 🔒 **Security Scanning**
- **Real-time vulnerability detection**
- **EPSS (Exploit Prediction Scoring System)** integration via FIRST API
- **Black Lotus Labs Threat Intelligence** integration (conceptual)
- **Automated security assessment** with detailed risk scoring

### 🔐 **Authentication & App Security**
- **Refresh-token sessions** (short-lived access token + refresh token)
- **Session management** (logout-all + per-session revoke)
- **CSRF protection** for authenticated state-changing requests
- **2FA (TOTP)** support with encrypted secrets at rest
- **Audit logging** for auth and scan actions
- **SSE behind authentication** (authenticated event stream)

### 📊 **Advanced Reporting**
- **PDF & CSV export** functionality
- **Interactive charts** with Chart.js integration
- **Real-time dashboards** with live vulnerability feeds
- **Historical trend analysis**

### ⚡ **Performance & Scalability**
- **Redis Bull Queue** for background job processing
- **Server-Sent Events (SSE)** for real-time updates
- **MongoDB** for efficient data storage

### UI/UX
- **React 18** with a small set of page components
- **Tailwind CSS** plus a few custom CSS helpers for cards/buttons
- **Clean layout** with light 3D card effects and simple SVG icons
- **Public Learn Page** explaining common vulnerabilities and real-world breaches

---

## Architecture

```
Frontend (React + Vite)
    │
    │  HTTP + JSON, cookies
    ▼
Backend API (Express + MongoDB + Redis/Bull)
    │
    │  Redis pub/sub
    ▼
Python worker (scan engine)
```

The usual flow for a scan is:

1. User logs in (username/password, optional TOTP 2FA) and receives:
   - A short-lived access token cookie
   - A refresh token cookie
   - A CSRF token cookie (must be echoed via `x-csrf-token` for state-changing requests)
2. User submits a target URL.
3. Backend creates a `Scan` in MongoDB and pushes a job onto a Bull queue.
4. Queue handler publishes `{ scanId, targetUrl, scanProfile }` to Redis for the Python worker.
5. Worker runs the selected checks and publishes `{ scanId, results }` back.
6. Backend enriches results (EPSS/threat intel), saves them, and updates the UI via authenticated SSE.
7. Users can:
   - View findings in the browser.
   - Export PDF or CSV reports.
   - Receive an email summary (if SMTP is configured).

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+)
- **MongoDB** (v5+)
- **Redis** (v6+)

Run each service in its own terminal. Commands below assume you start from the repo root (`Lumen/`).

### 1️⃣ Clone & Setup
```bash
git clone https://github.com/Wheezy72/Lumen.git
cd Lumen
```

### 2️⃣ Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### 3️⃣ Python Worker Setup
In a second terminal:

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: allow scanning public targets (default is false)
# export ALLOW_EXTERNAL=true

python worker.py
```

### 4️⃣ Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 5️⃣ Helper scripts
```bash
cd backend
npm run health        # Hit /health and exit 0/1
npm run devguide:pdf  # Render docs/dev_guide.md as reports/dev_guide.pdf
```

The **developer guide** lives in `docs/dev_guide.md`. The PDF output is helpful when you want a printable,
structured overview of how everything fits together.

---

## 🔧 Configuration

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description | Default |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/lumen_scanner` |
| `REDIS_URL` | Redis connection URL | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | JWT signing secret | **(required)** |
| `ACCESS_TOKEN_TTL` | Access token lifetime (JWT + cookie) | `15m` |
| `COOKIE_SECURE` | Set `true` when served over HTTPS | `false` |
| `COOKIE_DOMAIN` | Cookie domain; leave empty for host-only cookies (recommended) | *(empty)* |
| `SESSION_COOKIE_NAME` | Access token cookie name | `session` |
| `REFRESH_COOKIE_NAME` | Refresh token cookie name | `refresh` |
| `CSRF_COOKIE_NAME` | CSRF token cookie name | `csrf` |
| `TOTP_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt 2FA secrets at rest | *(empty)* |
| `TOTP_ISSUER` | Label shown in authenticator apps | `Lumen Scanner` |
| `ALLOW_PRIVATE_TARGETS` | Allow scanning targets resolving to private/local IP ranges | `false` |
| `PORT` | Backend server port | `4000` |
| `CORS_ORIGINS` | Allowed frontend origins (comma-separated) | `http://localhost:5173` |
| `BLACKLOTUS_API_KEY` | Threat intelligence API key | *(optional)* |
| `LOG_LEVEL` | Logging verbosity | `info` |

See `backend/.env.example` for the full list.

### Scan policy toggles (SSRF guardrails)

Lumen is opinionated about what it will scan by default:

- **Backend**: `ALLOW_PRIVATE_TARGETS` (default `false`) rejects targets that resolve to private/local ranges.
- **Python worker**: `ALLOW_EXTERNAL` (default `false`) blocks scanning public/external targets unless explicitly enabled.

For most local dev, you will either scan a local app (keep `ALLOW_EXTERNAL=false`) or enable external scanning with `ALLOW_EXTERNAL=true` in the Python worker environment.

---

## Project Structure

```text
Lumen/
├── backend/                 # Express.js API + queue + reporting
│   ├── src/
│   │   ├── index.js         # Main server entry
│   │   ├── routes/          # Auth, scans, reports, SSE
│   │   ├── models/          # User, Session, Scan, AuditLog schemas
│   │   ├── middleware/      # Auth, CSRF, audit logging, input hardening
│   │   ├── queue/           # Bull queue + Redis bridge to worker
│   │   ├── services/        # Email, threat intel helpers
│   │   └── utils/           # Logger and small utilities
│   ├── scripts/
│   │   ├── e2e.js                   # Simple end-to-end runner
│   │   ├── export.js                # Export reports/results to zip
│   │   ├── generate-doc.js          # Generate API docs
│   │   ├── generate-dev-guide-pdf.js# Builds docs/dev_guide.md → reports/dev_guide.pdf
│   │   ├── health-check.js          # Calls /health and exits 0/1
│   │   └── scheduled-scans.js       # Scheduled scan runner
├── frontend/                # React client (Vite + Tailwind)
│   ├── src/
│   │   ├── App.jsx          # Shell + routing + layout
│   │   ├── index.css        # Small design system (buttons, cards, animations)
│   │   └── pages/
│   │       ├── Landing.jsx          # Landing page with CTAs
│   │       ├── Login.jsx            # Username/password login
│   │       ├── Register.jsx         # Simple registration
│   │       ├── Dashboard.jsx        # Metrics and charts
│   │       ├── Scans.jsx            # Scan list + direct PDF/CSV actions
│   │       ├── NewScan.jsx          # Start a new scan
│   │       ├── ReportView.jsx       # Per-scan findings and exports
│   │       └── Vulnerabilities.jsx  # Public learning page
│   └── public/
├── python/
│   ├── worker.py            # Python scan engine listening on Redis
│   ├── utils/               # SSRF-safe HTTP client + URL validation
│   └── requirements.txt
└── docs/
    └── dev_guide.md         # “Lumen Bible” developer guide
```

---

## 🛠️ Development

### Available Scripts

#### Backend
```bash
npm run dev        # Start development server
npm run start      # Start production server
npm test           # Run Jest test suite
npm run test:e2e   # Run E2E script
npm run docs       # Generate API docs
npm run export:zip # Export reports/results as a zip
npm run scheduler  # Run scheduled scan runner (if enabled)
npm run health     # Hit /health and exit 0/1
npm run devguide:pdf # Render docs/dev_guide.md as a PDF
npm run lint        # Currently a placeholder
```

#### Frontend
```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

### Testing

#### Backend
```bash
cd backend
npm test
```

#### Frontend
```bash
cd frontend
npm run build
```

### 🔍 Code Quality
- **ESLint** ready (configure as needed)
- **Modern ES modules** throughout
- **TypeScript** ready structure
- **Git hooks** ready for setup

---

## 🔐 Security Features

- **🛡️ Helmet.js + CSP** - Security headers
- **🍪 Cookie-based auth** - Short-lived access token + refresh token cookies
- **🧾 Session management** - Logout-all + per-session revoke
- **🧬 CSRF protection** - `x-csrf-token` header matched against CSRF cookie
- **🔐 2FA (TOTP)** - Optional second factor with encrypted secrets at rest
- **🧾 Audit logging** - Records auth and scan actions
- **🌐 CORS Configuration** - Cross-origin request control
- **📝 Input Validation** - Joi schema validation
- **🔒 Password Hashing** - bcrypt implementation
- **📊 Rate Limiting** - Built-in protection

---

## 📈 Performance

- **⚡ Vite** - Sub-second HMR
- **🚀 Redis (Bull + pub/sub)** - Queueing and worker messaging
- **📦 Code Splitting** - Optimized bundle sizes
- **🔄 Background Jobs** - Non-blocking scan execution
- **📡 SSE (authenticated)** - Real-time updates without polling

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** your feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

---

## 📊 Monitoring & Analytics

- **Winston Logging** - Structured logging
- **Morgan HTTP Logging** - Request/response logging
- **Error Tracking** - Comprehensive error handling
- **Performance Metrics** - Built-in monitoring hooks

---

## 🔮 Roadmap

- [ ] **Docker containerization**
- [ ] **Kubernetes deployment**
- [ ] **Advanced threat intelligence**
- [ ] **Machine learning integration**
- [ ] **Multi-tenant support**
- [ ] **Plugin architecture**
- [ ] **GraphQL API**
- [ ] **WebSocket real-time scanning**

---

## ⚖️ License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **FIRST.org** - EPSS API integration
- **Black Lotus Labs** - Threat intelligence concepts
- **Open Source Community** - For amazing tools and libraries

---

<div align="center">
  <p><strong>Built with ❤️ by <a href="https://github.com/Wheezy72">Wheezy</a></strong></p>
  <p><em>"Illuminating vulnerabilities in the digital darkness"</em></p>
</div>

---

## 📞 Support

- 📧 **Email**: wayne72dan@gmail.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/Wheezy72/Lumen/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/Wheezy72/Lumen/discussions)

<div align="center">
  <sub>⭐ Star this repo if you find it helpful!</sub>
</div>