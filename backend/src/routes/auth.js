import express from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken, setAuthCookie, clearAuthCookie, authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Registration expects a username for login, plus an optional email address for
// notifications and an optional display name.
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required(),
  // Removed .email() completely. It will now accept any string, or nothing at all.
  email: Joi.string().allow('', null).optional(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().max(100).allow('', null).optional(),
});

// Login is username + password only.
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, name } = await registerSchema.validateAsync(req.body, { stripUnknown: true });

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    // Build the query dynamically so we don't search for empty emails
    const query = [{ username }];
    if (normalizedEmail) {
      query.push({ email: normalizedEmail });
    }

    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Dynamically build the user object so MongoDB's partial email index ignores missing fields
    const newUserData = { username, passwordHash };
    if (normalizedEmail) newUserData.email = normalizedEmail;
    if (normalizedName) newUserData.name = normalizedName;

    const user = await User.create(newUserData);

    const token = signToken({ id: user._id, username: user.username });
    setAuthCookie(res, token);
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
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
      name: user.name,
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
      name: user.name,
      emailAlertsEnabled: user.emailAlertsEnabled,
    });
  } catch (e) {
    next(e);
  }
});

// Convenience endpoint for API testing: returns a bearer token for the current session.
router.get('/token', authMiddleware, async (req, res) => {
  const token = signToken({ id: req.user.id, username: req.user.username });
  res.json({ token });
});

router.post('/logout', async (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;