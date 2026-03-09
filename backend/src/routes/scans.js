import express from 'express';
import Joi from 'joi';
import dns from 'dns/promises';
import net from 'net';
import mongoose from 'mongoose';
import Scan from '../models/Scan.js';
import { scanQueue } from '../queue/index.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

const { ALLOW_PRIVATE_TARGETS = 'false' } = process.env;

function isPrivateIp(ip) {
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(n => parseInt(n, 10));
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }

  // IPv6 ULA fc00::/7 and loopback ::1
  if (ip === '::1') return true;
  return ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd');
}

async function enforceScanPolicy(targetUrl) {
  const url = new URL(targetUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'Only http and https targets are supported.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Targets must not include credentials.' };
  }

  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  const allowPrivate = ALLOW_PRIVATE_TARGETS.toLowerCase() === 'true';

  for (const r of resolved) {
    if (!allowPrivate && isPrivateIp(r.address)) {
      return { ok: false, error: 'Private/internal targets are not allowed by policy.' };
    }
  }

  return { ok: true };
}

// Validation schema for creating a scan
const scanCreateSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).required(),
  scanProfile: Joi.array().items(Joi.string()).optional(),
  scheduledFor: Joi.date().iso().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const scans = await Scan.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json(scans);
  } catch (e) { next(e); }
});

router.post('/', audit('scan.create', (req) => ({ targetUrl: req.body?.targetUrl })), async (req, res, next) => {
  try {
    const payload = await scanCreateSchema.validateAsync(req.body, { stripUnknown: true });

    const policy = await enforceScanPolicy(payload.targetUrl);
    if (!policy.ok) {
      return res.status(400).json({ error: policy.error });
    }

    // Determine initial status based on scheduling
    const isScheduled = payload.scheduledFor && new Date(payload.scheduledFor) > new Date();
    const status = isScheduled ? 'scheduled' : 'queued';

    const scan = await Scan.create({
      ...payload,
      userId: req.user.id,
      status,
      progress: 0,
      scheduled: isScheduled,
    });

    // Only queue immediately if not scheduled for later
    if (!isScheduled) {
      await scanQueue.add('start', {
        scanId: scan._id.toString(),
        scanProfile: payload.scanProfile,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } else {
      const delayMs = new Date(payload.scheduledFor).getTime() - Date.now();
      await scanQueue.add('start', {
        scanId: scan._id.toString(),
        scanProfile: payload.scanProfile,
      }, {
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }

    res.status(201).json(scan);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid scan id.' });
    }

    const scan = await Scan.findOne({ _id: req.params.id, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'I could not find that scan.' });
    res.json(scan);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const payload = await scanCreateSchema.validateAsync(req.body, { stripUnknown: true });
    const scan = await Scan.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, payload, { new: true });
    if (!scan) return res.status(404).json({ error: 'I could not find that scan.' });
    res.json(scan);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'I could not find that scan.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;