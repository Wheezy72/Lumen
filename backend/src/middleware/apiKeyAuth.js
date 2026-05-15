import { timingSafeEqual } from 'crypto';

const safeCompare = (a, b) => {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  // timingSafeEqual requires equal lengths; pad to avoid length leak
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ba.length === bb.length;
};

export const apiKeyAuthMiddleware = (req, res, next) => {
  const expected = process.env.PUBLIC_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Public API is not configured (PUBLIC_API_KEY missing).' });
  }

  const header = req.headers?.authorization;
  const bearer = typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;

  const key = bearer || req.headers?.['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API key required.' });

  if (!safeCompare(key, expected)) {
    return res.status(401).json({ error: 'API key is not valid.' });
  }

  const apiKeyId = String(process.env.PUBLIC_API_KEY_ID || '').trim();
  if (!apiKeyId) {
    return res.status(500).json({ error: 'Public API key identity is not configured.' });
  }

  req.apiKeyId = apiKeyId;
  next();
};
