import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

if (!process.env.JWT_SECRET) {
  dotenv.config();
}

const { JWT_SECRET, COOKIE_SECURE = 'false', COOKIE_DOMAIN = 'localhost', JWT_EXPIRES_IN = '7d' } = process.env;

export const signToken = (payload) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is missing');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const shouldSetCookieDomain = () => {
  if (!COOKIE_DOMAIN) return false;
  const normalized = String(COOKIE_DOMAIN).trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== 'localhost' && normalized !== '127.0.0.1';
};

export const setAuthCookie = (res, token) => {
  const options = {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  if (shouldSetCookieDomain()) {
    options.domain = COOKIE_DOMAIN;
  }

  res.cookie('session', token, options);
};

export const clearAuthCookie = (res) => {
  const options = {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
  };

  res.clearCookie('session', options);

  if (shouldSetCookieDomain()) {
    res.clearCookie('session', { ...options, domain: COOKIE_DOMAIN });
  }
};

export const authMiddleware = (req, res, next) => {
  const header = req.headers?.authorization;
  const bearer = typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;

  const token = bearer || req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
  }
};
