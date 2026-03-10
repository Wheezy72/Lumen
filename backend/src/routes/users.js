import express from 'express';
import Joi from 'joi';
import User from '../models/User.js';

const router = express.Router();

const updateSchema = Joi.object({
  email: Joi.string().allow('', null).optional(),
  name: Joi.string().max(100).allow('', null).optional(),
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
      name: user.name,
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

    const normalizedEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const normalizedName = typeof payload.name === 'string' ? payload.name.trim() : null;

    if (normalizedEmail) {
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ error: 'That email is already linked to another account.' });
      }
      user.email = normalizedEmail;
    } else if (payload.email === '' || payload.email === null) {
      user.email = undefined;
      user.emailAlertsEnabled = false;
    }

    if (normalizedName !== null) {
      user.name = normalizedName;
    }

    if (typeof payload.emailAlertsEnabled === 'boolean') {
      if (payload.emailAlertsEnabled && !user.email) {
        return res.status(400).json({ error: 'Add an email address before enabling email alerts.' });
      }
      user.emailAlertsEnabled = payload.emailAlertsEnabled;
    }

    await user.save();

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

export default router;
