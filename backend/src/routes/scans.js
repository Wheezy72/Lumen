import express from 'express';
import Joi from 'joi';
import Scan from '../models/Scan.js';
import { scanQueue } from '../queue/index.js';
import { isValidObjectId } from '../utils/objectId.js';

const router = express.Router();

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

router.post('/', async (req, res, next) => {
  try {
    const payload = await scanCreateSchema.validateAsync(req.body, { stripUnknown: true });
    
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
      // Schedule the job for later using Bull's delay feature
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
    if (!isValidObjectId(req.params.id)) {
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