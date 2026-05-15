import rateLimit from 'express-rate-limit';

export const createRateLimiter = ({ windowMs, max }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded. Please retry later.' });
  },
});
