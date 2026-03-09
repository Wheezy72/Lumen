import crypto from 'crypto';

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf';

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function ensureCsrfCookie(req, res, next) {
  const existing = req.cookies?.[CSRF_COOKIE_NAME];
  if (!existing) {
    res.cookie(CSRF_COOKIE_NAME, generateToken(), {
      httpOnly: false,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
    });
  }
  next();
}

export function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  const stateChanging = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  // Only enforce CSRF when a session cookie exists; this keeps login/register simple
  // while protecting authenticated actions.
  const hasSession = Boolean(req.cookies?.[process.env.SESSION_COOKIE_NAME || 'session']);
  if (!stateChanging || !hasSession) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token missing or invalid.' });
  }

  next();
}
