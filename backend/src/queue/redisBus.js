import Redis from 'ioredis';

import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import { REDIS_URL } from './scanQueue.js';

export const RESULT_CHANNEL = 'scan_results';
export const JOB_CHANNEL = 'scan_jobs';

export const redis = new Redis(REDIS_URL);
export const pub = new Redis(REDIS_URL);

const attachRedisErrorLogging = (client, label) => {
  client.on('error', (err) => {
    logger.warn('Redis connection error', { label, error: err.message });
  });

  client.on('end', () => {
    logger.warn('Redis connection ended', { label });
  });
};

attachRedisErrorLogging(redis, 'scan_results_subscriber');
attachRedisErrorLogging(pub, 'scan_jobs_publisher');

const PY_WORKER_HEARTBEAT_KEY = process.env.PY_WORKER_HEARTBEAT_KEY || 'scanner:python_worker:heartbeat';

export const isPythonWorkerAvailable = async () => {
  const heartbeat = await pub.get(PY_WORKER_HEARTBEAT_KEY);
  if (heartbeat) return true;

  try {
    const res = await pub.call('PUBSUB', 'NUMSUB', JOB_CHANNEL);
    const count = Array.isArray(res) && res.length >= 2 ? parseInt(res[1], 10) : 0;
    return count > 0;
  } catch (e) {
    logger.debug('PUBSUB NUMSUB failed while checking worker availability', { error: e.message });
    return false;
  }
};

let resultSubscriberPromise = null;

export const initResultSubscriber = ({ pendingScans, handleResults, jobQueueApp }) => {
  if (resultSubscriberPromise) return resultSubscriberPromise;

  const onResultMessage = (channel, message) => {
    if (channel !== RESULT_CHANNEL) return;

    (async () => {
      let data;
      try {
        const raw = Buffer.isBuffer(message) ? message.toString('utf8') : message;
        data = JSON.parse(raw);
      } catch (e) {
        logger.warn('Invalid JSON on scan result channel', { error: e.message });
        return;
      }

      const scanId = data?.scanId;
      if (!scanId) return;

      const waiter = pendingScans.get(scanId);
      if (!waiter) return;

      waiter.markHeardFromWorker();

      if (data.type === 'progress') {
        const nextProgress = Number(data.progress);
        if (!Number.isNaN(nextProgress)) {
          await waiter.enqueueWrite(async () => {
            waiter.scan.progress = Math.max(waiter.scan.progress || 0, nextProgress);
            await waiter.scan.save();
            publishScanUpdate(jobQueueApp(), { type: 'progress', scanId, progress: waiter.scan.progress });
          });
        }
        return;
      }

      if (data.type === 'error') {
        const errMsg = data.error || 'Worker error';
        logger.warn('Worker reported scan error', { scanId, error: errMsg });
        waiter.reject(new Error(errMsg));
        return;
      }

      logger.info('Received scan results', {
        scanId,
        resultsCount: Array.isArray(data.results) ? data.results.length : 0,
      });

      try {
        await waiter.enqueueWrite(() => handleResults(waiter.scan, data));
        waiter.resolve(true);
      } catch (e) {
        waiter.reject(e);
      }
    })().catch((err) => {
      logger.warn('Unhandled error while handling scan result', { error: err.message });
    });
  };

  resultSubscriberPromise = (async () => {
    redis.on('message', onResultMessage);
    await redis.subscribe(RESULT_CHANNEL);
    logger.info('Subscribed to scan result channel', { channel: RESULT_CHANNEL });
  })().catch((err) => {
    resultSubscriberPromise = null;
    throw err;
  });

  return resultSubscriberPromise;
};
