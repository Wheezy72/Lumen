import express from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import qrcode from 'qrcode';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { validatePassword } from '../services/passwordValidator.js';
import {
  authMiddleware,
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  createSession,
  rotateSessionRefreshToken,
  revokeSession,
  revokeAllUserSessions,
} from '../middleware/auth.js';
import { loginIpLimiter, loginUsernameLimiter, registerIpLimiter } from '../middleware/rateLimiter.js';
import { getLoginLockoutStatus, recordFailedLoginAttempt, resetLoginLockout } from '../services/lockout.js';
import { audit } from '../middleware/audit.js';
import { decryptSecret, encryptSecret, generateTotpSecret, totpOtpauthUrl, verifyTotp } from '../services/totp.js';

const router = express.Router();

const { JWT_SECRET } = process.env;

// Registration expects a username for login, plus an optional email address for
// notifications and an optional display name.
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  email: Joi.string().allow('', null).optional(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().max(100).allow('', null).optional(),
});

// Login is username + password only.
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const login2faSchema = Joi.object({
  tempToken: Joi.string().required(),
  code: Joi.string().trim().min(6).max(10).required(),
});

const enable2faVerifySchema = Joi.object({
  code: Joi.string().trim().min(6).max(10).required(),
});

router.post('/register', registerIpLimiter, audit('auth.register'), async (req, res, next) => {
  try {
    const { username, email, password, name } = await registerSchema.validateAsync(req.body, { stripUnknown: true });

    const pw = await validatePassword(password);
    if (!pw.ok) {
      return res.status(400).json({ error: 'Password does not meet requirements.', details: pw.errors });
    }

    const query = [{ username }];
    if (email) query.push({ email });

    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUserData = { username, passwordHash };
    if (email) newUserData.email = email;
    if (name) newUserData.name = name;

    const user = await User.create(newUserData);

    const { session, refreshToken } = await createSession({
      userId: user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const accessToken = signAccessToken({ id: user._id.toString(), username: user.username, sessionId: session._id.toString() });
    setAuthCookies(res, { accessToken, refreshToken });

    res.json({ id: user._id, username: user.username, email: user.email, name: user.name, totpEnabled: user.totpEnabled });
  } catch (e) {
    next(e);
  }
});

router.post('/login', loginIpLimiter, loginUsernameLimiter, audit('auth.login'), async (req, res, next) => {
  try {
    const { username, password } = await loginSchema.validateAsync(req.body, { stripUnknown: true });

    const lock = await getLoginLockoutStatus(username);
    if (lock.locked) {
      return res.status(429).json({ error: 'Account temporarily locked. Please try again later.', retryAfterSeconds: lock.retryAfterSeconds });
    }

    const user = await User.findOne({ username });
    if (!user) {
      await recordFailedLoginAttempt({ username, ip: req.ip, userAgent: req.get('user-agent') });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordFailedLoginAttempt({ username, ip: req.ip, userAgent: req.get('user-agent') });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    await resetLoginLockout({ username, ip: req.ip, userAgent: req.get('user-agent') });

    if (user.totpEnabled) {
      const tempToken = jwt.sign(
        { purpose: '2fa', id: user._id.toString(), username: user.username },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      return res.json({ requiresTwoFactor: true, tempToken });
    }

    const { session, refreshToken } = await createSession({
      userId: user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const accessToken = signAccessToken({ id: user._id.toString(), username: user.username, sessionId: session._id.toString() });
    setAuthCookies(res, { accessToken, refreshToken });

    res.json({ id: user._id, username: user.username, email: user.email, name: user.name, totpEnabled: user.totpEnabled });
  } catch (e) {
    next(e);
  }
});

router.post('/login/2fa', audit('auth.login.2fa'), async (req, res, next) => {
  try {
    const { tempToken, code } = await login2faSchema.validateAsync(req.body, { stripUnknown: true });

    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if (decoded?.purpose !== '2fa') {
      return res.status(400).json({ error: 'Invalid 2FA token.' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled for this account.' });
    }

    const secret = decryptSecret(user.totpSecret);
    if (!verifyTotp({ token: code, secret })) {
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }

    const { session, refreshToken } = await createSession({
      userId: user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const accessToken = signAccessToken({ id: user._id.toString(), username: user.username, sessionId: session._id.toString() });
    setAuthCookies(res, { accessToken, refreshToken });

    res.json({ id: user._id, username: user.username, email: user.email, name: user.name, totpEnabled: user.totpEnabled });
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', audit('auth.refresh'), async (req, res, next) => {
  try {
    const refresh = req.cookies?.[process.env.REFRESH_COOKIE_NAME || 'refresh'];
    const access = req.cookies?.[process.env.SESSION_COOKIE_NAME || 'session'];

    if (!refresh || !access) return res.status(401).json({ error: 'Session refresh not available.' });

    let decoded;
    try {
      decoded = jwt.decode(access);
    } catch {
      return res.status(401).json({ error: 'Session refresh not available.' });
    }

    const sessionId = decoded?.sessionId;
    const userId = decoded?.id;
    if (!sessionId || !userId) return res.status(401).json({ error: 'Session refresh not available.' });

    const rotated = await rotateSessionRefreshToken({
      sessionId,
      presentedRefreshToken: refresh,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!rotated) return res.status(401).json({ error: 'Session refresh not available.' });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'Session refresh not available.' });

    const accessToken = signAccessToken({ id: user._id.toString(), username: user.username, sessionId: rotated.session._id.toString() });
    setAuthCookies(res, { accessToken, refreshToken: rotated.refreshToken });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Basic "who am I" endpoint so the frontend can restore the session.
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ id: user._id, username: user.username, email: user.email, name: user.name, totpEnabled: user.totpEnabled });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', audit('auth.logout'), async (req, res) => {
  const sessionId = (() => {
    try {
      const access = req.cookies?.[process.env.SESSION_COOKIE_NAME || 'session'];
      return access ? jwt.decode(access)?.sessionId : null;
    } catch {
      return null;
    }
  })();

  if (sessionId) {
    await revokeSession(sessionId);
  }

  clearAuthCookies(res);
  res.json({ ok: true });
});

router.post('/logout-all', authMiddleware, audit('auth.logout_all'), async (req, res) => {
  await revokeAllUserSessions(req.user.id);
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get('/sessions', authMiddleware, async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json(sessions.map(s => ({
      id: s._id,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      revokedAt: s.revokedAt,
      ip: s.ip,
      userAgent: s.userAgent,
    })));
  } catch (e) {
    next(e);
  }
});

router.delete('/sessions/:id', authMiddleware, audit('auth.session.revoke', (req) => ({ sessionId: req.params.id })), async (req, res, next) => {
  try {
    const s = await Session.findOne({ _id: req.params.id, userId: req.user.id });
    if (!s) return res.status(404).json({ error: 'Session not found.' });
    s.revokedAt = new Date();
    await s.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/2fa/setup', authMiddleware, audit('auth.2fa.setup'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    const secret = generateTotpSecret();
    user.totpTempSecret = encryptSecret(secret);
    await user.save();

    const otpauthUrl = totpOtpauthUrl({ username: user.username, secret });
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.json({ otpauthUrl, qrDataUrl });
  } catch (e) {
    next(e);
  }
});

router.post('/2fa/verify', authMiddleware, audit('auth.2fa.enable'), async (req, res, next) => {
  try {
    const { code } = await enable2faVerifySchema.validateAsync(req.body, { stripUnknown: true });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.totpTempSecret) return res.status(400).json({ error: 'No pending 2FA setup.' });

    const secret = decryptSecret(user.totpTempSecret);
    if (!verifyTotp({ token: code, secret })) {
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }

    user.totpSecret = user.totpTempSecret;
    user.totpTempSecret = '';
    user.totpEnabled = true;
    await user.save();

    res.json({ ok: true, totpEnabled: true });
  } catch (e) {
    next(e);
  }
});

router.post('/2fa/disable', authMiddleware, audit('auth.2fa.disable'), async (req, res, next) => {
  try {
    const { code } = await enable2faVerifySchema.validateAsync(req.body, { stripUnknown: true });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.totpEnabled || !user.totpSecret) return res.json({ ok: true, totpEnabled: false });

    const secret = decryptSecret(user.totpSecret);
    if (!verifyTotp({ token: code, secret })) {
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }

    user.totpEnabled = false;
    user.totpSecret = '';
    user.totpTempSecret = '';
    await user.save();

    res.json({ ok: true, totpEnabled: false });
  } catch (e) {
    next(e);
  }
});

export default router;