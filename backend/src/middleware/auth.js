import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Session from '../models/Session.js';

dotenv.config();

const {
  JWT_SECRET,
  ACCESS_TOKEN_TTL = '15m',
  COOKIE_SECURE = 'false',
  COOKIE_DOMAIN = '',
  SESSION_COOKIE_NAME = 'session',
  REFRESH_COOKIE_NAME = 'refresh',
} = process.env;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing');
}

const cookieBaseOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE === 'true',
  sameSite: 'lax',
  path: '/',
};

function cookieOptions() {
  // Only set a Domain attribute when explicitly configured.
  // Leaving it unset produces a host-only cookie, which is the safest default
  // and avoids the special-case pitfalls of "localhost".
  return COOKIE_DOMAIN
    ? { ...cookieBaseOptions, domain: COOKIE_DOMAIN }
    : { ...cookieBaseOptions };
}

export const signAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export async function createSession({ userId, ip, userAgent }) {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = sha256Hex(refreshToken);

  const session = await Session.create({
    userId,
    refreshTokenHash,
    ip,
    userAgent,
    lastUsedAt: new Date(),
  });

  return { session, refreshToken };
}

export async function rotateSessionRefreshToken({ sessionId, presentedRefreshToken, ip, userAgent }) {
  const refreshTokenHash = sha256Hex(presentedRefreshToken);

  const session = await Session.findOne({ _id: sessionId, refreshTokenHash, revokedAt: null });
  if (!session) return null;

  const newRefreshToken = generateRefreshToken();
  session.refreshTokenHash = sha256Hex(newRefreshToken);
  session.lastUsedAt = new Date();
  session.ip = ip;
  session.userAgent = userAgent;
  await session.save();

  return { session, refreshToken: newRefreshToken };
}

export async function revokeSession(sessionId) {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllUserSessions(userId) {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(SESSION_COOKIE_NAME, accessToken, {
    ...cookieOptions(),
    // access token cookie is short-lived; browsers may treat missing maxAge as session cookie.
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

export const authMiddleware = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const decoded = verifyAccessToken(token);

    if (!decoded?.sessionId) {
      return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
    }

    const session = await Session.findOne({ _id: decoded.sessionId, userId: decoded.id, revokedAt: null });
    if (!session) {
      return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
  }
};
