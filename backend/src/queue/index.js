import Bull from 'bull';
import fetch from 'node-fetch';
import Redis from 'ioredis';

import Scan from '../models/Scan.js';
import RecurringScan from '../models/RecurringScan.js';
import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import { sendScanSummaryEmail, sendScanFailureEmail } from '../services/email.js';
import { computeScanDiff } from '../services/scanDiff.js';

/**
 * Queue wiring for scan jobs.
 * This module connects Express, Bull (job queue), and the Python worker:
 * 1. Receives scan requests from the API
 * 2. Publishes jobs to Redis for the Python worker
 * 3. Waits for results and updates the database
 * 4. Sends real-time updates via SSE
 * 5. Triggers email notifications on completion
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const scanQueue = new Bull('scanQueue', REDIS_URL);

let recurringSyncPromise = null;
export const syncRecurringSchedules = async () => {
  if (recurringSyncPromise) return recurringSyncPromise;

  recurringSyncPromise = (async () => {
    try {
      const enabled = await RecurringScan.find({ enabled: true }).select('_id cron timezone').lean();

      await Promise.all(
        enabled.map((recurring) => {
          const tz = recurring.timezone || undefined;
          const repeat = tz ? { cron: recurring.cron, tz } : { cron: recurring.cron };

          return scanQueue.add(
            'recurringTick',
            { recurringScanId: recurring._id.toString() },
            {
              jobId: `recurring:${recurring._id.toString()}`,
              repeat,
            },
          );
        }),
      );

      if (enabled.length) {
        logger.info('Recurring scan schedules synced', { count: enabled.length });
      }
    } catch (e) {
      logger.warn('Recurring scan schedule sync failed', { error: e.message });
    }
  })().finally(() => {
    recurringSyncPromise = null;
  });

  return recurringSyncPromise;
};

// Redis pub/sub for Python worker communication
const redis = new Redis(REDIS_URL);
const pub = new Redis(REDIS_URL);
const RESULT_CHANNEL = 'scan_results';
const JOB_CHANNEL = 'scan_jobs';

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

scanQueue.on('error', (err) => {
  logger.warn('Bull queue error', { error: err.message });
});

const PY_WORKER_HEARTBEAT_KEY = process.env.PY_WORKER_HEARTBEAT_KEY || 'scanner:python_worker:heartbeat';
const SCAN_TIMEOUT_MS = parseInt(process.env.SCAN_TIMEOUT_MS || String(15 * 60 * 1000), 10);
const WORKER_RESPONSE_TIMEOUT_MS = parseInt(process.env.SCAN_WORKER_RESPONSE_TIMEOUT_MS || String(20 * 1000), 10);

const pendingScans = new Map();
let resultSubscriberPromise = null;

const initResultSubscriber = () => {
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

const createWaiter = (scanId, scan) => {
  let settled = false;
  let overallTimeout = null;
  let responseTimeout = null;
  let heardFromWorker = false;

  // Mongoose throws if you call scan.save() concurrently on the same document.
  // Progress messages can arrive quickly, so serialize all writes per scan.
  let writeChain = Promise.resolve();
  const enqueueWrite = (fn) => {
    writeChain = writeChain.then(fn, fn);
    return writeChain;
  };

  const cleanup = () => {
    if (overallTimeout) clearTimeout(overallTimeout);
    if (responseTimeout) clearTimeout(responseTimeout);
  };

  let _resolve;
  let _reject;
  const promise = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  const settle = (fn) => (value) => {
    if (settled) return;
    settled = true;
    cleanup();
    pendingScans.delete(scanId);
    fn(value);
  };

  const resolve = settle(_resolve);
  const reject = settle(_reject);

  const start = () => {
    // The worker can publish an immediate "job received" progress message.
    // If that arrives before start() is called, we must not arm the response timeout.
    if (!heardFromWorker) {
      responseTimeout = setTimeout(() => {
        reject(new Error(`No response from Python worker within ${WORKER_RESPONSE_TIMEOUT_MS}ms`));
      }, WORKER_RESPONSE_TIMEOUT_MS);
    }

    overallTimeout = setTimeout(() => {
      reject(new Error('Worker timeout - scan took too long'));
    }, SCAN_TIMEOUT_MS);
  };

  const markHeardFromWorker = () => {
    heardFromWorker = true;
    if (responseTimeout) {
      clearTimeout(responseTimeout);
      responseTimeout = null;
    }
  };

  return {
    scan,
    promise,
    start,
    cleanup,
    resolve,
    reject,
    markHeardFromWorker,
    enqueueWrite,
  };
};

const isPythonWorkerAvailable = async () => {
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

// Reference to Express app for SSE notifications
let _app = null;
export const setJobQueueApp = (app) => { _app = app; };
const jobQueueApp = () => _app;

export const configureBull = () => {
  scanQueue.process('recurringTick', async (job) => {
    const recurringScanId = job?.data?.recurringScanId;
    if (!recurringScanId) return;

    const recurring = await RecurringScan.findById(recurringScanId);
    if (!recurring || !recurring.enabled) return;

    const scan = await Scan.create({
      userId: recurring.userId || null,
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

    recurring.lastRunAt = new Date();
    await recurring.save();

    await scanQueue.add(
      'start',
      {
        scanId: scan._id.toString(),
        scanProfile: recurring.scanProfile || [],
        webhookUrl: recurring.webhookUrl || undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  });

  // Process scan jobs
  scanQueue.process('start', async (job) => {
    const { scanId, scanProfile } = job.data;

    await initResultSubscriber();

    const scan = await Scan.findById(scanId);
    if (!scan) {
      logger.warn('Scan not found when starting job', { scanId });
      return;
    }

    const workerAvailable = await isPythonWorkerAvailable();
    if (!workerAvailable) {
      logger.warn('Python worker appears offline - failing scan fast', { scanId });
      throw new Error('Python worker is offline (no heartbeat)');
    }

    logger.info('Starting scan job', { scanId, targetUrl: scan.targetUrl });

    const waiter = createWaiter(scanId, scan);
    pendingScans.set(scanId, waiter);

    try {
      scan.status = 'running';
      scan.startedAt = new Date();
      scan.progress = 5;
      await scan.save();

      publishScanUpdate(jobQueueApp(), { type: 'progress', scanId, progress: 5 });

      await pub.publish(JOB_CHANNEL, JSON.stringify({
        scanId,
        targetUrl: scan.targetUrl,
        scanProfile: scanProfile || scan.scanProfile || null,
      }));

      waiter.start();
      await waiter.promise;
    } finally {
      waiter.cleanup();
      pendingScans.delete(scanId);
    }
  });

  scanQueue.on('completed', async (job) => {
    if (job.name !== 'start') return;

    const { scanId, webhookUrl } = job.data;
    const scan = await Scan.findById(scanId);

    if (scan) {
      try {
        await sendScanSummaryEmail(scan);
      } catch (e) {
        logger.warn('Summary email failed', { scanId, error: e.message });
      }
    }

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'completed',
            scanId,
            status: scan?.status,
            resultsCount: scan?.results?.length || 0,
            policy: scan?.policy,
            diffSummary: scan?.diffSummary,
          }),
        });
      } catch (e) {
        logger.warn('Webhook notification failed', { webhookUrl, error: e.message });
      }
    }

    publishScanUpdate(jobQueueApp(), {
      type: 'completed',
      scanId,
      status: scan?.status,
      progress: scan?.progress,
    });
  });

  scanQueue.on('failed', async (job, err) => {
    if (job.name !== 'start') return;

    const { scanId, webhookUrl } = job.data;
    logger.warn('Scan job failed', { scanId, error: err.message });
    const scan = await Scan.findById(scanId);

    if (scan && scan.status !== 'completed') {
      scan.status = 'failed';
      scan.error = err.message;
      await scan.save();

      try {
        await sendScanFailureEmail(scan, err.message);
      } catch (e) {
        logger.warn('Failure email failed', { scanId, error: e.message });
      }

      publishScanUpdate(jobQueueApp(), { type: 'failed', scanId, error: err.message });

      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'failed', scanId, error: err.message }),
          });
        } catch (e) {
          logger.warn('Webhook failure notification failed', { webhookUrl, error: e.message });
        }
      }
    }
  });
};

async function handleResults(scan, data) {
  const results = data.results || [];

  scan.results = results;
  scan.progress = 100;
  scan.status = 'completed';
  scan.completedAt = new Date();

  if (scan.targetHost) {
    try {
      const anchor = scan.completedAt || new Date();
      const previous = await Scan.findOne({
        userId: scan.userId,
        status: 'completed',
        targetHost: scan.targetHost,
        _id: { $ne: scan._id },
        completedAt: { $lt: anchor },
      }).sort({ completedAt: -1, createdAt: -1 });

      if (previous?.status === 'completed') {
        const diff = computeScanDiff(previous.results || [], results);

        const blockedSeverities = ['high', 'critical'];
        const newBlocked = (diff.newIssues || []).filter((v) => {
          const sev = (v.severity || 'info').toLowerCase();
          return blockedSeverities.includes(sev);
        });

        scan.diffSummary = {
          compareScanId: previous._id,
          newCount: diff.newIssues.length,
          fixedCount: diff.fixedIssues.length,
          persistingCount: diff.persisting.length,
          newBlockedCount: newBlocked.length,
        };

        scan.policy = {
          status: newBlocked.length ? 'fail' : 'pass',
          blockedSeverities,
          evaluatedAt: new Date(),
        };
      } else {
        scan.policy = {
          status: 'skipped',
          blockedSeverities: ['high', 'critical'],
          evaluatedAt: new Date(),
        };
      }
    } catch (e) {
      logger.warn('Policy evaluation failed', { scanId: scan._id.toString(), error: e.message });
    }
  }

  await scan.save();

  publishScanUpdate(jobQueueApp(), {
    type: 'completed',
    scanId: scan._id.toString(),
    progress: 100,
    status: 'completed',
  });

  return true;
}