import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { configureBull } from './index.js';

const { MONGODB_URI, LOG_LEVEL = 'info' } = process.env;

logger.level = LOG_LEVEL;

if (!MONGODB_URI) {
  logger.error('MONGODB_URI is required for the queue worker process');
  process.exit(1);
}

const shutdown = async (signal) => {
  logger.info('Shutting down queue worker', { signal });
  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

mongoose.connect(MONGODB_URI, { autoIndex: true })
  .then(() => {
    logger.info('MongoDB connected (queue worker)');
    configureBull();
    logger.info('Queue worker is ready');
  })
  .catch((err) => {
    logger.error('MongoDB connection error (queue worker)', { error: err.message });
    process.exit(1);
  });
