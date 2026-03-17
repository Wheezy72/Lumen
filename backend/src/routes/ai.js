import express from 'express';
import Joi from 'joi';
import Scan from '../models/Scan.js';
import { assistantChat } from '../services/assistant.js';

const router = express.Router();

const messageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant').required(),
  content: Joi.string().min(1).max(2000).required(),
});

const chatSchema = Joi.object({
  scanId: Joi.string().required(),
  findingIndex: Joi.number().integer().min(0).required(),
  messages: Joi.array().items(messageSchema).min(1).max(12).required(),
});

router.post('/chat', async (req, res, next) => {
  try {
    const { scanId, findingIndex, messages } = await chatSchema.validateAsync(req.body, { stripUnknown: true });

    const scan = await Scan.findOne({ _id: scanId, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'Scan not found.' });

    const results = Array.isArray(scan.results) ? scan.results : [];
    const finding = results[findingIndex];
    if (!finding) return res.status(404).json({ error: 'Finding not found.' });

    const result = await assistantChat({ scan, finding, messages });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
