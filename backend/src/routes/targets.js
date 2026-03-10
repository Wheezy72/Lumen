import express from 'express';
import Joi from 'joi';
import Target from '../models/Target.js';
import Scan from '../models/Scan.js';

const router = express.Router();

const updateSchema = Joi.object({
  tags: Joi.array().items(Joi.string()).optional(),
  baselineScanId: Joi.string().allow('', null).optional(),
  policyEnabled: Joi.boolean().optional(),
  policySeverities: Joi.array().items(Joi.string().valid('low', 'medium', 'high', 'critical', 'info')).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    // Backfill targets for older scans that pre-date target tracking.
    const orphanScans = await Scan.find({
      userId: req.user.id,
      $or: [{ targetId: { $exists: false } }, { targetId: null }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('_id targetUrl targetHost');

    for (const s of orphanScans) {
      let host = s.targetHost;
      if (!host) {
        try {
          host = new URL(s.targetUrl).hostname?.toLowerCase();
        } catch {
          host = null;
        }
      }

      if (!host) continue;

      const target = await Target.findOneAndUpdate(
        { userId: req.user.id, host },
        { $setOnInsert: { userId: req.user.id, host } },
        { upsert: true, new: true },
      );

      await Scan.updateOne({ _id: s._id, userId: req.user.id }, { $set: { targetId: target._id, targetHost: host } });
    }

    const targets = await Target.find({ userId: req.user.id }).sort({ updatedAt: -1 }).limit(200);

    // Attach last scan summary (lightweight, no populate required)
    const targetIds = targets.map((t) => t._id);
    const scans = await Scan.find({ userId: req.user.id, targetId: { $in: targetIds } })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('_id targetId status progress createdAt completedAt results targetUrl targetHost policy diffSummary');

    const byTarget = new Map();
    for (const s of scans) {
      const key = String(s.targetId);
      if (!byTarget.has(key)) byTarget.set(key, []);
      if (byTarget.get(key).length < 6) byTarget.get(key).push(s);
    }

    res.json(targets.map((t) => ({
      ...t.toObject(),
      recentScans: byTarget.get(String(t._id)) || [],
    })));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const target = await Target.findOne({ _id: req.params.id, userId: req.user.id });
    if (!target) return res.status(404).json({ error: 'Target not found' });

    res.json(target);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const payload = await updateSchema.validateAsync(req.body, { stripUnknown: true });

    const target = await Target.findOne({ _id: req.params.id, userId: req.user.id });
    if (!target) return res.status(404).json({ error: 'Target not found' });

    if (payload.tags) {
      target.tags = payload.tags
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20);
    }

    if (typeof payload.policyEnabled === 'boolean') {
      target.policyEnabled = payload.policyEnabled;
    }

    if (payload.policySeverities) {
      target.policySeverities = payload.policySeverities;
    }

    if (typeof payload.baselineScanId !== 'undefined') {
      const raw = payload.baselineScanId;
      const normalized = raw ? String(raw).trim() : '';

      if (!normalized) {
        target.baselineScanId = null;
      } else {
        const baseline = await Scan.findOne({ _id: normalized, userId: req.user.id, targetId: target._id });
        if (!baseline) return res.status(400).json({ error: 'Baseline scan must belong to this target and account.' });
        if (baseline.status !== 'completed') return res.status(400).json({ error: 'Baseline scan must be completed.' });
        target.baselineScanId = baseline._id;
      }
    }

    await target.save();
    res.json(target);
  } catch (e) {
    next(e);
  }
});

export default router;
