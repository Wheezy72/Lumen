import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Ensure environment is loaded. backend/src/index.js also calls dotenv.config(),
// but this keeps auth middleware safe when imported independently.
dotenv.config();

const {
  JWT_SECRET,
  COOKIE_SECURE = 'false',
  COOKIE_DOMAIN = '',
  JWT_EXPIRES_IN = '7d',
} = process.env;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing');
}

export const signToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const setAuthCookie = (res, token) => {
  const opts = {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };

  // Browsers treat "Domain=localhost" inconsistently. For local dev, prefer a host-only cookie.
  if (COOKIE_DOMAIN && COOKIE_DOMAIN !== 'localhost') {
    opts.domain = COOKIE_DOMAIN;
  }

  res.cookie('session', token, opts);
};

export const clearAuthCookie = (res) => {
  const opts = {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  };

  if (COOKIE_DOMAIN && COOKIE_DOMAIN !== 'localhost') {
    opts.domain = COOKIE_DOMAIN;
  }

  res.clearCookie('session', opts);
};

export const authMiddleware = (req, res, next) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
  }
};
