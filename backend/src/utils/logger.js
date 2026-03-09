import fs from 'fs';
import winston from 'winston';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt',
]);

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') return '[REDACTED]';
  return '[REDACTED]';
}

function scrub(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrub);

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = redact(v);
    } else {
      out[k] = scrub(v);
    }
  }
  return out;
}

// Ensure logs directory exists for file transport.
try {
  fs.mkdirSync('logs', { recursive: true });
} catch {
  // ignore
}

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format((info) => {
      if (info && typeof info === 'object') {
        return scrub(info);
      }
      return info;
    })(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
});

export const logRequest = (req, res, next) => {
  logger.info('HTTP request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  next();
};