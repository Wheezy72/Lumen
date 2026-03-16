const timingSafeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));

  if (ba.length !== bb.length) return false;

  // Buffer.timingSafeEqual throws if lengths differ.
  return Buffer.timingSafeEqual(ba, bb);
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

  if (!timingSafeEqual(key, expected)) {
    return res.status(401).json({ error: 'API key is not valid.' });
  }

  next();
};
