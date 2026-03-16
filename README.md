# Lumen Vulnerability Scanner

Lumen is a small, focused web application vulnerability scanner built for developers and students who cannot justify the cost or complexity of heavy commercial tools like Burp Suite or Nessus.

It gives you:

- A simple web UI to start scans and view results.
- A Python engine that runs practical checks (XSS, SQLi, headers, cookies, error leakage, etc.).
- PDF/CSV reports that explain **how** each issue was found and **how** to reduce the risk.

The stack:

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js (Express), MongoDB, Redis + Bull, SSE
- **Worker**: Python (requests, BeautifulSoup, dnspython, redis)

---

## Features

### 🔒 **Security Scanning**
- **Real-time vulnerability detection**
- **EPSS (Exploit Prediction Scoring System)** integration via FIRST API
- **Black Lotus Labs Threat Intelligence** integration (conceptual)
- **Automated security assessment** with detailed risk scoring

### 📊 **Advanced Reporting**
- **PDF & CSV export** functionality
- **Interactive charts** with Chart.js integration
- **Real-time dashboards** with live vulnerability feeds
- **Historical trend analysis**

### ⚡ **Performance & Scalability**
- **Redis Bull Queue** for background job processing
- **Server-Sent Events (SSE)** for real-time updates
- **MongoDB** for efficient data storage
- **JWT authentication** with secure session management

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

1. User logs in (username + password) and submits a target URL.
2. Backend creates a `Scan` in MongoDB and pushes a job onto a Bull queue.
3. Queue handler publishes `{ scanId, targetUrl }` to Redis for the Python worker.
4. Worker runs 10 small checks and publishes `{ scanId, results }` back.
5. Backend enriches results (EPSS/threat intel), saves them, and updates the UI via SSE.
6. Users can:
   - View findings in the browser.
   - Export PDF or CSV reports.
   - Receive an email summary (if SMTP is configured).

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+)
- **MongoDB** (v5+)
- **Redis** (v6+)

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

### 3️⃣ Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

### 4️⃣ Start Queue Worker (Optional)
```bash
cd backend
npm run worker
```

### 5️⃣ Helper scripts
```bash
cd backend
npm run health        # Hit /health and exit 0/1
npm run devguide:pdf  # Render docs/dev_guide.md as reports/dev_guide.pdf
```

### API-only mode (no web UI)
If you just want to drive scans from scripts/CI, you can run the backend + workers and call the key-protected API.

1) Set `PUBLIC_API_KEY` in `backend/.env`.

2) Start services (MongoDB + Redis), then:
```bash
cd backend
npm run dev
```
```bash
cd python
python worker.py
```

3) Call the API:
```bash
curl -sS http://localhost:4000/api/publicApi/scans \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target":"https://example.com","modules":["headers","cookies"]}'
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
| `PORT` | Backend server port | `4000` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |
| `BLACKLOTUS_API_KEY` | Threat intelligence API key | *(optional)* |
| `LOG_LEVEL` | Logging verbosity | `info` |

---

## Project Structure

```text
Lumen/
├── backend/                 # Express.js API + queue + reporting
│   ├── src/
│   │   ├── index.js         # Main server entry
│   │   ├── routes/          # Auth, scans, reports, SSE
│   │   ├── models/          # User and Scan Mongoose schemas
│   │   ├── middleware/      # Auth and error handling
│   │   ├── queue/           # Bull queue + Redis bridge to worker
│   │   ├── services/        # Email, threat intel helpers
│   │   └── utils/           # Logger and small utilities
│   ├── scripts/
│   │   ├── health-check.js          # Calls /health and exits 0/1
│   │   └── generate-dev-guide-pdf.js# Builds docs/dev_guide.md → reports/dev_guide.pdf
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
│   └── requirements.txt
└── docs/
    └── dev_guide.md         # “Lumen Bible” developer guide
```

---

## 🛠️ Development

### Available Scripts

#### Backend
```bash
npm run dev      # Start development server
npm run start    # Start production server
npm run worker   # Start queue worker
npm run test:e2e # Run E2E tests
npm run docs     # Generate API docs
```

#### Frontend
```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

### 🔍 Code Quality
- **ESLint** ready (configure as needed)
- **Modern ES modules** throughout
- **TypeScript** ready structure
- **Git hooks** ready for setup

---

## 🔐 Security Features

- **🛡️ Helmet.js** - Security headers
- **🔐 JWT Authentication** - Secure token-based auth
- **🍪 HTTP-only Cookies** - XSS protection
- **🌐 CORS Configuration** - Cross-origin request control
- **📝 Input Validation** - Joi schema validation
- **🔒 Password Hashing** - bcrypt implementation
- **📊 Rate Limiting** - Built-in protection

---

## 📈 Performance

- **⚡ Vite** - Sub-second HMR
- **🚀 Redis Caching** - Lightning-fast data access
- **📦 Code Splitting** - Optimized bundle sizes
- **🔄 Background Jobs** - Non-blocking operations
- **📡 SSE** - Real-time updates without polling

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