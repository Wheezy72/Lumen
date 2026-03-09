import dotenv from 'dotenv';
dotenv.config();

// Main Express application for the Lumen backend.
//
// This file wires together:
// - Security middleware (Helmet, CORS, cookies)
// - MongoDB connection
// - Scan queue + Redis/Python worker
// - HTTP routes for auth, scans, reports and SSE
// - A simple /health endpoint for basic diagnostics.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoSanitize from 'express-mongo-sanitize';
import { logger } from './utils/logger.js';
import { sseRouter, sseInit } from './routes/sse.js';
import authRouter from './routes/auth.js';
import scanRouter from './routes/scans.js';
import reportRouter from './routes/reports.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { configureBull, setJobQueueApp } from './queue/index.js';
import { xssSanitizerMiddleware } from './middleware/xss.js';
import { csrfProtection, ensureCsrfCookie } from './middleware/csrf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  MONGODB_URI,
  CORS_ORIGINS,
  PORT = 4000,
  NODE_ENV = 'development',
  REPORTS_DIR = 'reports',
  LOG_LEVEL = 'info'
} = process.env;

logger.level = LOG_LEVEL;

// Ensure reports directory exists
const reportsPath = path.join(__dirname, '..', REPORTS_DIR);
if (!fs.existsSync(reportsPath)) {
  fs.mkdirSync(reportsPath, { recursive: true });
}

const app = express();
app.disable('x-powered-by');

export { app };

const isProduction = NODE_ENV === 'production';

// Security headers via Helmet with CSP
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...(CORS_ORIGINS ? CORS_ORIGINS.split(',') : [])],
      frameAncestors: ["'none'"],
      ...(isProduction ? { 'upgrade-insecure-requests': [] } : {}),
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Modern browsers ignore X-XSS-Protection; don't send legacy headers.
  xssFilter: false,
  permissionsPolicy: {
    features: {
      geolocation: [],
      camera: [],
      microphone: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

if (isProduction) {
  app.use(helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  }));
}

// CORS for frontend
const allowedOrigins = CORS_ORIGINS ? CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : [];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error('CORS not allowed');
      err.status = 403;
      callback(err);
    }
  },
  credentials: true,
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: false }));
app.use(cookieParser());

// Input hardening
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(xssSanitizerMiddleware);

// CSRF
app.use(ensureCsrfCookie);
app.use(csrfProtection);

// Serve generated reports over HTTP (fixes file:// blocked downloads)
app.use('/static/reports', express.static(reportsPath));

// MongoDB connection
mongoose.connect(MONGODB_URI, { autoIndex: true })
  .then(() => logger.info('MongoDB connected'))
  .catch((err) => {
    logger.error('MongoDB connection error', { error: err.message });
    process.exit(1);
  });

// Initialize Bull queues and worker delegation
if (process.env.NODE_ENV !== 'test') {
  configureBull();
  setJobQueueApp(app);
}

// SSE setup
sseInit(app);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/scans', authMiddleware, scanRouter);
app.use('/api/reports', authMiddleware, reportRouter);
app.use('/api/sse', authMiddleware, sseRouter);

// Health check – simple JSON status for scripts and uptime checks.
// For now this reports node environment and basic MongoDB connectivity.
app.get('/health', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const status = dbReady ? 'ok' : 'degraded';
  res.json({ status, env: NODE_ENV, db: dbReady ? 'connected' : 'disconnected' });
});

// Error handling
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
  });
}
