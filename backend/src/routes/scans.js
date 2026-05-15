import express from 'express';
import Joi from 'joi';
import Scan from '../models/Scan.js';
import RecurringScan from '../models/RecurringScan.js';
import { computeScanDiff } from '../services/scanDiff.js';
import { scanQueue } from '../queue/index.js';
import { extractTargetHost, validateScanTargetUrl, validateWebhookUrl } from '../utils/networkPolicy.js';
import { writeAuditEvent } from '../utils/audit.js';

const router = express.Router();

// Validation schema
const scanSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).required(),
  scanProfile: Joi.array().items(Joi.string()).optional(),
  scheduledFor: Joi.date().iso().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
  authHeaders: Joi.object({
    cookie: Joi.string().max(8192).allow(''),
    authorization: Joi.string().max(8192).allow(''),
  }).optional(),
  sourcePath: Joi.string().min(1).max(1024).optional(),
});

const recurringScanSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).required(),
  scanProfile: Joi.array().items(Joi.string()).min(1).required(),
  cron: Joi.string().required(),
  timezone: Joi.string().optional(),
  enabled: Joi.boolean().optional().default(true),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
  runNow: Joi.boolean().optional().default(false),
});

const recurringScanUpdateSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).optional(),
  scanProfile: Joi.array().items(Joi.string()).min(1).optional(),
  cron: Joi.string().optional(),
  timezone: Joi.string().optional().allow(null, ''),
  enabled: Joi.boolean().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional().allow(null, ''),
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

const ensureRecurringJob = async (recurring) => {
  const tz = recurring.timezone || undefined;
  const repeat = tz ? { cron: recurring.cron, tz } : { cron: recurring.cron };

  await scanQueue.add(
    'recurringTick',
    { recurringScanId: recurring._id.toString() },
    {
      jobId: `recurring:${recurring._id.toString()}`,
      repeat,
    },
  );
};

const removeRecurringJob = async (recurring) => {
  const jobs = await scanQueue.getRepeatableJobs();
  const jobId = `recurring:${recurring._id.toString()}`;

  await Promise.all(
    jobs
      .filter((j) => j.id === jobId || String(j.key || '').includes(jobId))
      .map((j) => scanQueue.removeRepeatableByKey(j.key)),
  );
};

// List recurring scan schedules
router.get('/recurring', async (req, res, next) => {
  try {
    const items = await RecurringScan.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// Create recurring scan schedule (cron)
router.post('/recurring', async (req, res, next) => {
  try {
    const data = await recurringScanSchema.validateAsync(req.body, { stripUnknown: true });
    const normalizedTargetUrl = await validateScanTargetUrl(data.targetUrl);
    const targetHost = extractTargetHost(normalizedTargetUrl);
    const webhookUrl = data.webhookUrl ? await validateWebhookUrl(data.webhookUrl) : undefined;

    const recurring = await RecurringScan.create({
      userId: req.user.id,
      targetUrl: normalizedTargetUrl,
      targetHost: targetHost || undefined,
      scanProfile: data.scanProfile,
      cron: data.cron,
      timezone: data.timezone || undefined,
      enabled: data.enabled,
      webhookUrl,
    });

    if (recurring.enabled) {
      try {
        await ensureRecurringJob(recurring);
      } catch (e) {
        await recurring.deleteOne();
        return res.status(400).json({ error: `Invalid schedule: ${e.message}` });
      }
    }

    if (data.runNow) {
      const scan = await Scan.create({
        userId: req.user.id,
        targetUrl: data.targetUrl,
        targetHost: targetHost || undefined,
        scanProfile: data.scanProfile,
        status: 'queued',
        scheduled: true,
        scheduledFor: new Date(),
        progress: 0,
        webhookUrl,
        policy: { status: 'unknown' },
        recurringScanId: recurring._id,
      });

      await scanQueue.add(
        'start',
        { scanId: scan._id.toString(), scanProfile: data.scanProfile, webhookUrl },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      return res.status(201).json({ recurring, startedScanId: scan._id.toString() });
    }

    await writeAuditEvent({
      action: 'recurring_schedule_created',
      actorType: 'user',
      actorId: String(req.user.id),
      scheduleId: String(recurring._id),
      targetHost,
      status: 'success',
      ip: req.ip,
    });
    res.status(201).json({ recurring });
  } catch (err) {
    next(err);
  }
});

// Update recurring schedule (enable/disable, cron, etc)
router.patch('/recurring/:id', async (req, res, next) => {
  try {
    const data = await recurringScanUpdateSchema.validateAsync(req.body, { stripUnknown: true });

    const recurring = await RecurringScan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!recurring) return res.status(404).json({ error: 'Recurring scan not found' });

    const prevEnabled = recurring.enabled;
    const prevCron = recurring.cron;
    const prevTz = recurring.timezone;

    if (data.targetUrl) {
      const normalizedTargetUrl = await validateScanTargetUrl(data.targetUrl);
      recurring.targetUrl = normalizedTargetUrl;
      recurring.targetHost = extractTargetHost(normalizedTargetUrl) || undefined;
    }

    if (typeof data.webhookUrl !== 'undefined') {
      recurring.webhookUrl = data.webhookUrl ? await validateWebhookUrl(data.webhookUrl) : undefined;
    }

    if (data.scanProfile) recurring.scanProfile = data.scanProfile;
    if (typeof data.cron === 'string') recurring.cron = data.cron;
    if (typeof data.timezone !== 'undefined') recurring.timezone = data.timezone || undefined;
    if (typeof data.enabled === 'boolean') recurring.enabled = data.enabled;

    await recurring.save();

    const cronChanged = recurring.cron !== prevCron || recurring.timezone !== prevTz;

    if (prevEnabled) {
      if (!recurring.enabled || cronChanged) {
        await removeRecurringJob({ _id: recurring._id, cron: prevCron, timezone: prevTz });
      }
    }

    if (recurring.enabled && (!prevEnabled || cronChanged)) {
      try {
        await ensureRecurringJob(recurring);
      } catch (e) {
        recurring.enabled = false;
        await recurring.save();
        return res.status(400).json({ error: `Invalid schedule: ${e.message}` });
      }
    }

    await writeAuditEvent({
      action: 'recurring_schedule_updated',
      actorType: 'user',
      actorId: String(req.user.id),
      scheduleId: String(recurring._id),
      status: 'success',
      ip: req.ip,
    });
    res.json({ recurring });
  } catch (err) {
    next(err);
  }
});

// Run a recurring schedule immediately
router.post('/recurring/:id/run', async (req, res, next) => {
  try {
    const recurring = await RecurringScan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!recurring) return res.status(404).json({ error: 'Recurring scan not found' });

    const scan = await Scan.create({
      userId: req.user.id,
      targetUrl: recurring.targetUrl,
      targetHost: recurring.targetHost || undefined,
      scanProfile: recurring.scanProfile || [],
      status: 'queued',
      scheduled: true,
      scheduledFor: new Date(),
      progress: 0,
      webhookUrl: recurring.webhookUrl || undefined,
      policy: { status: 'unknown' },
      recurringScanId: recurring._id,
    });

    await scanQueue.add(
      'start',
      { scanId: scan._id.toString(), scanProfile: recurring.scanProfile || [], webhookUrl: recurring.webhookUrl || undefined },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    res.status(201).json({ startedScanId: scan._id.toString() });
  } catch (err) {
    next(err);
  }
});

// Delete recurring schedule
router.delete('/recurring/:id', async (req, res, next) => {
  try {
    const recurring = await RecurringScan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!recurring) return res.status(404).json({ error: 'Recurring scan not found' });

    await removeRecurringJob(recurring);
    await recurring.deleteOne();

    await writeAuditEvent({
      action: 'recurring_schedule_deleted',
      actorType: 'user',
      actorId: String(req.user.id),
      scheduleId: String(req.params.id),
      status: 'success',
      ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Create a new scan
router.post('/', async (req, res, next) => {
  try {
    const data = await scanSchema.validateAsync(req.body, { stripUnknown: true });

    // Check if scan is scheduled for later
    const scheduledTime = data.scheduledFor ? new Date(data.scheduledFor) : null;
    const isScheduled = scheduledTime && scheduledTime > new Date();

    const normalizedTargetUrl = await validateScanTargetUrl(data.targetUrl);
    const targetHost = extractTargetHost(normalizedTargetUrl);
    const webhookUrl = data.webhookUrl ? await validateWebhookUrl(data.webhookUrl) : undefined;

    const scan = await Scan.create({
      targetHost: targetHost || undefined,
      targetUrl: normalizedTargetUrl,
      scanProfile: data.scanProfile || [],
      scheduledFor: scheduledTime,
      userId: req.user.id,
      status: isScheduled ? 'scheduled' : 'queued',
      scheduled: isScheduled,
      progress: 0,
      webhookUrl,
      policy: { status: 'unknown' },
    });

    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };

    if (isScheduled) {
      jobOptions.delay = scheduledTime.getTime() - Date.now();
    }

    const requestHeaders = {};
    const cookie = data.authHeaders?.cookie ? String(data.authHeaders.cookie).trim() : '';
    const authorization = data.authHeaders?.authorization ? String(data.authHeaders.authorization).trim() : '';

    if (cookie) requestHeaders.Cookie = cookie;
    if (authorization) requestHeaders.Authorization = authorization;

    await scanQueue.add(
      'start',
      {
        scanId: scan._id.toString(),
        scanProfile: data.scanProfile,
        webhookUrl,
        requestHeaders: Object.keys(requestHeaders).length ? requestHeaders : undefined,
        sourcePath: data.sourcePath || undefined,
      },
      jobOptions,
    );

    await writeAuditEvent({
      action: 'scan_created',
      actorType: 'user',
      actorId: String(req.user.id),
      scanId: String(scan._id),
      targetHost,
      scheduled: Boolean(isScheduled),
      status: 'success',
      ip: req.ip,
    });

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

    await writeAuditEvent({
      action: 'scan_deleted',
      actorType: 'user',
      actorId: String(req.user.id),
      scanId: String(req.params.id),
      status: 'success',
      ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
