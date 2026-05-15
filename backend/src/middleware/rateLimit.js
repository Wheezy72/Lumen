const buckets = new Map();

const normalizeIp = (value) => {
  if (!value) return 'unknown';
  if (Array.isArray(value)) return String(value[0] || 'unknown');
  return String(value).split(',')[0].trim() || 'unknown';
};

const maybeCleanup = (now) => {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

export const createRateLimiter = ({ windowMs, max, keyPrefix }) => (req, res, next) => {
  const now = Date.now();
  maybeCleanup(now);

  const ip = normalizeIp(req.ip || req.headers['x-forwarded-for']);
  const key = `${keyPrefix}:${ip}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(max - bucket.count, 0);
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > max) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    return res.status(429).json({ error: 'Rate limit exceeded. Please retry later.' });
  }

  return next();
};
