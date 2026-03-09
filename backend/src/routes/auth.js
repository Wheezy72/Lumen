import express from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken, setAuthCookie, clearAuthCookie, authMiddleware } from '../middleware/auth.js';
import { loginIpLimiter, loginUsernameLimiter, registerIpLimiter } from '../middleware/rateLimiter.js';
import { getLoginLockoutStatus, recordFailedLoginAttempt, resetLoginLockout } from '../services/lockout.js';
import { validatePassword } from '../services/passwordValidator.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Registration expects a username for login, plus an optional email address for
// notifications and an optional display name.
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  // Removed .email() completely. It will now accept any string, or nothing at all.
  email: Joi.string().allow('', null).optional(),
  password: Joi.string().max(128).required(),
  name: Joi.string().max(100).allow('', null).optional(),
});

// Login is username + password only.
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/register', registerIpLimiter, async (req, res, next) => {
  try {
    const { username, email, password, name } = await registerSchema.validateAsync(req.body, { stripUnknown: true });

    const pw = await validatePassword(password);
    if (!pw.ok) {
      return res.status(400).json({
        error: 'Password does not meet security requirements.',
        details: pw.errors,
      });
    }

    // Build the query dynamically so we don't search for empty emails
    const query = [{ username }];
    if (email) {
      query.push({ email });
    }

    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Dynamically build the user object so MongoDB's sparse index ignores empty fields
    const newUserData = { username, passwordHash };
    if (email) newUserData.email = email;
    if (name) newUserData.name = name;

    const user = await User.create(newUserData);
    
    const token = signToken({ id: user._id, username: user.username });
    setAuthCookie(res, token);
    res.json({ id: user._id, username: user.username, email: user.email, name: user.name });
  } catch (e) {
    next(e);
  }
});

router.post('/login', loginIpLimiter, loginUsernameLimiter, async (req, res, next) => {
  try {
    const { username, password } = await loginSchema.validateAsync(req.body, { stripUnknown: true });

    const userAgent = req.get('user-agent');

    const lockout = await getLoginLockoutStatus(username);
    if (lockout.locked) {
      logger.warn('Login blocked due to active lockout', {
        username,
        ip: req.ip,
        userAgent,
        retryAfterSeconds: lockout.retryAfterSeconds,
      });

      if (lockout.retryAfterSeconds) {
        res.set('Retry-After', String(lockout.retryAfterSeconds));
      }

      return res.status(423).json({ error: 'Account temporarily locked. Please try again later.' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      const result = await recordFailedLoginAttempt({ username, ip: req.ip, userAgent });
      if (result.locked) {
        res.set('Retry-After', String(result.retryAfterSeconds));
        return res.status(423).json({ error: 'Account temporarily locked. Please try again later.' });
      }
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const result = await recordFailedLoginAttempt({ username, ip: req.ip, userAgent });
      if (result.locked) {
        res.set('Retry-After', String(result.retryAfterSeconds));
        return res.status(423).json({ error: 'Account temporarily locked. Please try again later.' });
      }
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    await resetLoginLockout({ username, ip: req.ip, userAgent });

    const token = signToken({ id: user._id, username: user.username });
    setAuthCookie(res, token);
    res.json({ id: user._id, username: user.username, email: user.email, name: user.name });
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
    res.json({ id: user._id, username: user.username, email: user.email, name: user.name });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;