import jwt from 'jsonwebtoken';

const {
  JWT_SECRET,
  COOKIE_SECURE = 'false',
  COOKIE_DOMAIN,
  JWT_EXPIRES_IN = '7d',
} = process.env;

const cookieBaseOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE === 'true',
  sameSite: 'lax',
  // Browsers often reject `Domain=localhost`; omit the domain unless explicitly set.
  ...(COOKIE_DOMAIN && COOKIE_DOMAIN !== 'localhost' ? { domain: COOKIE_DOMAIN } : {}),
};

export const signToken = (payload) => {
  if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is missing');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const setAuthCookie = (res, token) => {
  res.cookie('session', token, {
    ...cookieBaseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearAuthCookie = (res) => {
  res.clearCookie('session', cookieBaseOptions);
};

export const authMiddleware = (req, res, next) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session is not valid. Please sign in again.' });
  }
};
