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
import { logger } from './utils/logger.js';
import { sseRouter, sseInit } from './routes/sse.js';
import authRouter from './routes/auth.js';
import scanRouter from './routes/scans.js';
import reportRouter from './routes/reports.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { configureBull, setJobQueueApp } from './queue/index.js';

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

// Security headers via Helmet with basic CSP
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...(CORS_ORIGINS ? CORS_ORIGINS.split(',') : [])],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

// CORS for frontend
const allowedOrigins = CORS_ORIGINS ? CORS_ORIGINS.split(',').map(o => o.trim()) : [];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

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
configureBull();
setJobQueueApp(app);

// SSE setup
sseInit(app);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/scans', authMiddleware, scanRouter);
app.use('/api/reports', authMiddleware, reportRouter);
app.use('/api/sse', sseRouter);

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
app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
});
