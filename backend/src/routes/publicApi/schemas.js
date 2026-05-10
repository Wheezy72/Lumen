import Joi from 'joi';

export const SCAN_MODULES = [
  'headers',
  'cookies',
  'tls',
  'exposure',
  'cors',
  'redirect',
  'xss',
  'sqli',
  'traversal',
  'command_injection',
  'csrf',
  'subdomain',
  'error',
  'access_control',
  'rate_limit',
  'sast',
];

// Optional map of HTTP headers/cookies forwarded to the Python crawler so it
// can authenticate against the target instead of landing on a login screen.
// Example:  { "Cookie": "PHPSESSID=abc123; security=low" }
//
// sourcePath is only used by the lightweight SAST module. The path must point
// at a directory the Python worker can read; arbitrary filesystem access is
// gated by the worker process's own permissions.
export const startScanSchema = Joi.object({
  target:         Joi.string().uri({ allowRelative: false }).required(),
  modules:        Joi.array().items(Joi.string().valid(...SCAN_MODULES)).optional(),
  webhookUrl:     Joi.string().uri({ allowRelative: false }).optional(),
  requestHeaders: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  sourcePath:     Joi.string().min(1).max(1024).optional(),
});

export const scheduleSchema = Joi.object({
  target:     Joi.string().uri({ allowRelative: false }).required(),
  cron:       Joi.string().required(),
  modules:    Joi.array().items(Joi.string().valid(...SCAN_MODULES)).optional(),
  timezone:   Joi.string().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
  sourcePath: Joi.string().min(1).max(1024).optional(),
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
