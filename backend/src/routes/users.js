import express from 'express';
import Joi from 'joi';
import User from '../models/User.js';
import { signToken, setAuthCookie } from '../middleware/auth.js';

const router = express.Router();

const updateSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).optional(),
  email: Joi.string().email().max(254).required(),
  emailAlertsEnabled: Joi.boolean().optional(),
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'Account not found.' });

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

router.put('/me', async (req, res, next) => {
  try {
    const payload = await updateSchema.validateAsync(req.body, { stripUnknown: true });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    const prevUsername = user.username;

    if (typeof payload.username === 'string') {
      const normalizedUsername = payload.username.trim();
      if (!normalizedUsername) {
        return res.status(400).json({ error: 'Username cannot be empty.' });
      }

      if (normalizedUsername !== user.username) {
        const existing = await User.findOne({ username: normalizedUsername, _id: { $ne: user._id } });
        if (existing) {
          return res.status(409).json({ error: 'That username is already taken.' });
        }
        user.username = normalizedUsername;
      }
    }

    const normalizedEmail = payload.email.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
    if (existing) {
      return res.status(409).json({ error: 'That email is already linked to another account.' });
    }

    user.email = normalizedEmail;

    if (typeof payload.emailAlertsEnabled === 'boolean') {
      if (payload.emailAlertsEnabled && !user.email) {
        return res.status(400).json({ error: 'Add an email address before enabling email alerts.' });
      }
      user.emailAlertsEnabled = payload.emailAlertsEnabled;
    }

    await user.save();

    if (user.username !== prevUsername) {
      const token = signToken({ id: user._id, username: user.username });
      setAuthCookie(res, token);
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

export default router;
