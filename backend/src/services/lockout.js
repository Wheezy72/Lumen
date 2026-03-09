import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(REDIS_URL);
redis.on('error', (err) => {
  logger.error('Redis error (auth lockout)', { error: err.message });
});

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 15 * 60;

const failedKey = (username) => `auth:lockout:failed:${username}`;
const lockKey = (username) => `auth:lockout:locked:${username}`;

const normalizeUsername = (username) => username?.toString().trim();

export const getLoginLockoutStatus = async (username) => {
  const u = normalizeUsername(username);
  if (!u) return { locked: false };

  const ttl = await redis.ttl(lockKey(u));
  if (ttl === -2) return { locked: false };

  return {
    locked: true,
    retryAfterSeconds: ttl > 0 ? ttl : null,
  };
};

export const recordFailedLoginAttempt = async ({ username, ip, userAgent }) => {
  const u = normalizeUsername(username);
  if (!u) return { locked: false, attempts: 0 };

  const key = failedKey(u);
  const attempts = await redis.incr(key);

  const ttl = await redis.ttl(key);
  if (ttl === -1 || ttl === -2) {
    await redis.expire(key, LOCKOUT_SECONDS);
  }

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await redis
      .multi()
      .set(lockKey(u), '1', 'EX', LOCKOUT_SECONDS)
      .del(key)
      .exec();

    logger.warn('Account temporarily locked due to failed login attempts', {
      username: u,
      ip,
      userAgent,
      attempts,
      lockoutSeconds: LOCKOUT_SECONDS,
    });

    return { locked: true, attempts, retryAfterSeconds: LOCKOUT_SECONDS };
  }

  logger.info('Failed login attempt recorded', {
    username: u,
    ip,
    userAgent,
    attempts,
    remaining: MAX_FAILED_ATTEMPTS - attempts,
  });

  return {
    locked: false,
    attempts,
    remaining: MAX_FAILED_ATTEMPTS - attempts,
  };
};

export const resetLoginLockout = async ({ username, ip, userAgent }) => {
  const u = normalizeUsername(username);
  if (!u) return;

  const deleted = await redis.del(failedKey(u), lockKey(u));

  logger.info('Login lockout counters reset', {
    username: u,
    ip,
    userAgent,
    deletedKeys: deleted,
  });
};
