import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(REDIS_URL);
redis.on('error', (err) => {
  logger.error('Redis error (rate limiter)', { error: err.message });
});

const createStore = (prefix) => new RedisStore({
  sendCommand: (command, ...args) => redis.call(command, ...args),
  prefix,
});

const rateLimitHandler = (label) => (req, res, next, options) => {
  logger.warn('Rate limit exceeded', {
    label,
    ip: req.ip,
    username: req.body?.username,
    path: req.originalUrl,
    method: req.method,
    windowMs: options.windowMs,
    max: options.max,
  });

  res.status(options.statusCode).json({
    error: options.message,
  });
};

const standardOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

export const loginIpLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
  store: createStore('rl:auth:login:ip:'),
  handler: rateLimitHandler('auth.login.ip'),
});

export const loginUsernameLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
  store: createStore('rl:auth:login:username:'),
  keyGenerator: (req) => {
    const username = req.body?.username?.toString().trim();
    if (!username) return `missing:${req.ip}`;
    return username;
  },
  handler: rateLimitHandler('auth.login.username'),
});

export const registerIpLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Please try again later.',
  store: createStore('rl:auth:register:ip:'),
  handler: rateLimitHandler('auth.register.ip'),
});
