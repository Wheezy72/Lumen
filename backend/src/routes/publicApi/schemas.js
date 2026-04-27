import Joi from 'joi';

// Optional map of HTTP headers/cookies forwarded to the Python crawler so it
// can authenticate against the target instead of landing on a login screen.
// Example:  { "Cookie": "PHPSESSID=abc123; security=low" }
export const startScanSchema = Joi.object({
  target:         Joi.string().uri({ allowRelative: false }).required(),
  modules:        Joi.array().items(Joi.string()).optional(),
  webhookUrl:     Joi.string().uri({ allowRelative: false }).optional(),
  requestHeaders: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
});

export const scheduleSchema = Joi.object({
  target:     Joi.string().uri({ allowRelative: false }).required(),
  cron:       Joi.string().required(),
  modules:    Joi.array().items(Joi.string()).optional(),
  timezone:   Joi.string().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
  runNow:     Joi.boolean().optional().default(false),
});

const messageSchema = Joi.object({
  role:    Joi.string().valid('user', 'assistant').required(),
  content: Joi.string().min(1).max(2000).required(),
});

export const publicChatSchema = Joi.object({
  findingIndex: Joi.number().integer().min(0).required(),
  messages:     Joi.array().items(messageSchema).min(1).max(12).required(),
});
