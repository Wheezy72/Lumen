import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Ensure environment is loaded
if (!process.env.JWT_SECRET) {
  dotenv.config();
}

const { JWT_SECRET, COOKIE_SECURE = 'false', COOKIE_DOMAIN = 'localhost', JWT_EXPIRES_IN = '7d' } = process.env;

// Debug: Log JWT_SECRET availability on module load
console.log('Auth middleware loaded - JWT_SECRET present:', Boolean(JWT_SECRET));

export const signToken = (payload) => {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is undefined at signToken execution');
    throw new Error('JWT_SECRET environment variable is missing');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const setAuthCookie = (res, token) => {
  res.cookie('session', token, {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearAuthCookie = (res) => {
  res.clearCookie('session', {
    httpOnly: true,
    secure: COOKIE_SECURE === 'true',
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
  });
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
