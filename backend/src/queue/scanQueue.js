import Bull from 'bull';
import { logger } from '../utils/logger.js';

export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const scanQueue = new Bull('scanQueue', REDIS_URL);

scanQueue.on('error', (err) => {
  logger.warn('Bull queue error', { error: err.message });
});
