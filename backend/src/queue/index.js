import fetch from 'node-fetch';

import Scan from '../models/Scan.js';
import RecurringScan from '../models/RecurringScan.js';
import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import { sendScanSummaryEmail, sendScanFailureEmail } from '../services/email.js';
import { validateWebhookUrl } from '../utils/networkPolicy.js';

import { scanQueue } from './scanQueue.js';
import { syncRecurringSchedules } from './recurringSchedules.js';
import { pub, JOB_CHANNEL, initResultSubscriber, isPythonWorkerAvailable } from './redisBus.js';
import { createWaiter } from './scanWaiter.js';
import handleResults from './handleResults.js';

/**
 * Queue wiring for scan jobs.
 * This module connects Express, Bull (job queue), and the Python worker.
 */

export { scanQueue, syncRecurringSchedules };

const pendingScans = new Map();

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
      apiKeyId: recurring.apiKeyId || undefined,
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

  scanQueue.process('start', async (job) => {
    const { scanId, scanProfile, requestHeaders, sourcePath } = job.data;

    await initResultSubscriber({
      pendingScans,
      jobQueueApp,
      handleResults: (scan, data) => handleResults(scan, data, jobQueueApp),
    });

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

    const waiter = createWaiter(scanId, scan, pendingScans);
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
        requestHeaders: requestHeaders || null,
        sourcePath: sourcePath || null,
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
        const safeWebhookUrl = await validateWebhookUrl(webhookUrl);
        await fetch(safeWebhookUrl, {
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
          const safeWebhookUrl = await validateWebhookUrl(webhookUrl);
          await fetch(safeWebhookUrl, {
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
