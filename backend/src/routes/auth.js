import express from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import User from '../models/User.js';
import { signToken, setAuthCookie, clearAuthCookie, authMiddleware } from '../middleware/auth.js';
import { sendPasswordResetCodeEmail } from '../services/email.js';

const router = express.Router();

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  email: Joi.string().email().max(254).required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/)
    .required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  code: Joi.string().pattern(/^\d{6}$/).required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/)
    .required(),
});

// Login is username + password only.
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = await registerSchema.validateAsync(req.body, { stripUnknown: true });

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ $or: [{ username }, { email: normalizedEmail }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      username,
      email: normalizedEmail,
      passwordHash,
    });

    const token = signToken({ id: user._id, username: user.username });
    setAuthCookie(res, token);
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      emailAlertsEnabled: user.emailAlertsEnabled,
      token,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = await loginSchema.validateAsync(req.body, { stripUnknown: true });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

    const token = signToken({ id: user._id, username: user.username });
    setAuthCookie(res, token);
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      emailAlertsEnabled: user.emailAlertsEnabled,
      token,
    });
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
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      emailAlertsEnabled: user.emailAlertsEnabled,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const emailEnabled = ['true', '1', 'yes', 'on'].includes(String(process.env.EMAIL_ENABLED || '').toLowerCase());
    if (!emailEnabled) {
      return res.status(503).json({ error: 'Email is not configured on this server.' });
    }

    const { email } = await forgotPasswordSchema.validateAsync(req.body, { stripUnknown: true });
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (user) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      user.passwordResetCodeHash = codeHash;
      user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      await sendPasswordResetCodeEmail({
        to: user.email,
        username: user.username,
        code,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, password } = await resetPasswordSchema.validateAsync(req.body, { stripUnknown: true });
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    const storedHash = user?.passwordResetCodeHash;
    const storedExp = user?.passwordResetExpiresAt;

    if (!user || !storedHash || !storedExp || storedExp.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }

    const providedHash = crypto.createHash('sha256').update(String(code)).digest('hex');

    const a = Buffer.from(storedHash, 'utf8');
    const b = Buffer.from(providedHash, 'utf8');
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!match) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetCodeHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
