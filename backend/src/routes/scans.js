import express from 'express';
import Joi from 'joi';
import net from 'node:net';
import Scan from '../models/Scan.js';
import { computeScanDiff } from '../services/scanDiff.js';
import { scanQueue } from '../queue/index.js';

const router = express.Router();

const BLOCKED_IP_PREFIXES = [
  '0.',
  '10.',
  '127.',
  '169.254.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
];

const isBlockedHost = (host) => {
  if (!host) return true;

  const h = String(host).toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;

  const ipType = net.isIP(h);
  if (ipType === 4) {
    return BLOCKED_IP_PREFIXES.some((p) => h.startsWith(p));
  }

  // Keep IPv6 simple: block localhost; allow public domains.
  if (ipType === 6) {
    if (h === '::1') return true;
  }

  return false;
};

// Validation schema
const scanSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).required(),
  scanProfile: Joi.array().items(Joi.string()).optional(),
  scheduledFor: Joi.date().iso().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
});

// Get all scans for current user
router.get('/', async (req, res, next) => {
  try {
    const scans = await Scan.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(scans);
  } catch (err) {
    next(err);
  }
});

// List completed scans that have a previous scan to compare against.
const listChanges = async (req, res, next) => {
  try {
    const scans = await Scan.find({
      userId: req.user.id,
      status: 'completed',
      'diffSummary.compareScanId': { $ne: null },
    })
      .select('_id targetUrl targetHost status createdAt completedAt diffSummary')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(scans);
  } catch (err) {
    next(err);
  }
};

router.get('/regressions', listChanges);
router.get('/changes', listChanges);

// Create a new scan
router.post('/', async (req, res, next) => {
  try {
    const data = await scanSchema.validateAsync(req.body, { stripUnknown: true });

    // Check if scan is scheduled for later
    const scheduledTime = data.scheduledFor ? new Date(data.scheduledFor) : null;
    const isScheduled = scheduledTime && scheduledTime > new Date();

    let host;
    try {
      host = new URL(data.targetUrl).hostname?.toLowerCase();
    } catch {
      host = null;
    }

    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === 'true';
    if (!allowPrivate && isBlockedHost(host)) {
      return res.status(400).json({
        error: 'This target is not allowed. For safety, localhost/private network targets are blocked in this deployment.',
      });
    }

    const scan = await Scan.create({
      targetHost: host || undefined,
      targetUrl: data.targetUrl,
      scanProfile: data.scanProfile || [],
      scheduledFor: scheduledTime,
      userId: req.user.id,
      status: isScheduled ? 'scheduled' : 'queued',
      scheduled: isScheduled,
      progress: 0,
      webhookUrl: data.webhookUrl || undefined,
      policy: { status: 'unknown' },
    });

    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };

    if (isScheduled) {
      jobOptions.delay = scheduledTime.getTime() - Date.now();
    }

    await scanQueue.add(
      'start',
      {
        scanId: scan._id.toString(),
        scanProfile: data.scanProfile,
        webhookUrl: data.webhookUrl || undefined,
      },
      jobOptions,
    );

    res.status(201).json(scan);
  } catch (err) {
    next(err);
  }
});

// Get single scan
router.get('/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json(scan);
  } catch (err) {
    next(err);
  }
});

// Diff current scan vs previous scan (or an explicitly provided scan).
router.get('/:id/diff', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    if (scan.status !== 'completed') {
      return res.json({ compareScanId: null, diff: null, policy: scan.policy || { status: 'unknown' } });
    }

    const explicitCompareId = typeof req.query.compareScanId === 'string' ? req.query.compareScanId.trim() : '';
    let compareScan = null;

    if (explicitCompareId) {
      compareScan = await Scan.findOne({ _id: explicitCompareId, userId: req.user.id, status: 'completed' });
    } else if (scan.targetHost) {
      const anchor = scan.completedAt || scan.createdAt;
      compareScan = await Scan.findOne({
        userId: req.user.id,
        status: 'completed',
        targetHost: scan.targetHost,
        completedAt: { $lt: anchor },
      }).sort({ completedAt: -1, createdAt: -1 });
    }

    if (!compareScan) {
      return res.json({ compareScanId: null, diff: null, policy: scan.policy || { status: 'unknown' } });
    }

    const diff = computeScanDiff(compareScan.results || [], scan.results || []);

    res.json({
      compareScanId: compareScan._id,
      compareCreatedAt: compareScan.createdAt,
      diff,
      policy: scan.policy || { status: 'unknown' },
    });
  } catch (err) {
    next(err);
  }
});

// Delete scan
router.delete('/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;