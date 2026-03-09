import express from 'express';
import Joi from 'joi';
import Scan from '../models/Scan.js';
import { scanQueue } from '../queue/index.js';

const router = express.Router();

// Validation schema
const scanSchema = Joi.object({
  targetUrl: Joi.string().uri({ allowRelative: false }).required(),
  scanProfile: Joi.array().items(Joi.string()).optional(),
  scheduledFor: Joi.date().iso().optional(),
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

// Create a new scan
router.post('/', async (req, res, next) => {
  try {
    const data = await scanSchema.validateAsync(req.body, { stripUnknown: true });
    
    // Check if scan is scheduled for later
    const scheduledTime = data.scheduledFor ? new Date(data.scheduledFor) : null;
    const isScheduled = scheduledTime && scheduledTime > new Date();
    
    // Create scan record
    const scan = await Scan.create({
      targetUrl: data.targetUrl,
      scanProfile: data.scanProfile || [],
      scheduledFor: scheduledTime,
      userId: req.user.id,
      status: isScheduled ? 'scheduled' : 'queued',
      scheduled: isScheduled,
      progress: 0,
    });

    // Add job to queue (with delay if scheduled)
    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };
    
    if (isScheduled) {
      jobOptions.delay = scheduledTime.getTime() - Date.now();
    }

    await scanQueue.add('start', {
      scanId: scan._id.toString(),
      scanProfile: data.scanProfile,
    }, jobOptions);

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
      userId: req.user.id 
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    res.json(scan);
  } catch (err) {
    next(err);
  }
});

// Delete scan
router.delete('/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.id 
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