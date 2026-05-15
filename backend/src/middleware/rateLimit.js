import rateLimit from 'express-rate-limit';

export const createRateLimiter = ({ windowMs, max, keyPrefix }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${keyPrefix}:${req.ip || 'unknown'}`,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded. Please retry later.' });
  },
});
