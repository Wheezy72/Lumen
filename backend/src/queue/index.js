import Bull from 'bull';
import Scan from '../models/Scan.js';
import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import fetch from 'node-fetch';
import Redis from 'ioredis';
import { sendScanSummaryEmail, sendScanFailureEmail } from '../services/email.js';

/**
 * Queue wiring for scan jobs.
 * * This module connects Express, Bull (job queue), and the Python worker:
 * 1. Receives scan requests from the API
 * 2. Publishes jobs to Redis for the Python worker
 * 3. Waits for results and updates the database
 * 4. Sends real-time updates via SSE
 * 5. Triggers email notifications on completion
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const scanQueue = new Bull('scanQueue', REDIS_URL);

// Redis pub/sub for Python worker communication
// NOTE: We intentionally create a *per-job* subscriber connection to avoid race
// conditions where the Python worker publishes results before we subscribe.
const pub = new Redis(REDIS_URL);
const RESULT_CHANNEL = 'scan_results';
const JOB_CHANNEL = 'scan_jobs';

const NO_MESSAGE_TIMEOUT_MS = Number(process.env.PY_WORKER_NO_MESSAGE_TIMEOUT_MS || 90_000);
const WORKER_TOTAL_TIMEOUT_MS = Number(process.env.PY_WORKER_TOTAL_TIMEOUT_MS || 15 * 60 * 1000);

export const configureBull = () => {
  // Process scan jobs
  scanQueue.process('start', async (job) => {
    const { scanId, scanProfile } = job.data;

    const scan = await Scan.findById(scanId);
    if (!scan) {
      logger.warn('Scan not found when starting job', { scanId });
      return;
    }

    // Update scan status to running
    scan.status = 'running';
    scan.startedAt = new Date();
    scan.progress = 5;
    await scan.save();

    publishScanUpdate(jobQueueApp(), { type: 'progress', scanId, progress: 5 });

    // Dedicated subscription connection for this job.
    const sub = new Redis(REDIS_URL);

    try {
      await sub.subscribe(RESULT_CHANNEL);

      const resultData = await new Promise((resolve, reject) => {
        let gotAnyMessageForScan = false;

        const noMsgTimeout = setTimeout(() => {
          cleanup();
          reject(
            new Error(
              'No response from Python worker. Ensure python/worker.py is running and REDIS_URL matches the backend.'
            )
          );
        }, NO_MESSAGE_TIMEOUT_MS);

        const totalTimeout = setTimeout(() => {
          cleanup();
          reject(
            new Error(
              'Worker timeout - no scan results were received. Ensure python/worker.py is running and the target is reachable.'
            )
          );
        }, WORKER_TOTAL_TIMEOUT_MS);

        const cleanup = () => {
          clearTimeout(noMsgTimeout);
          clearTimeout(totalTimeout);
          if (onMessage) sub.removeListener('message', onMessage);
        };

        const handleMessage = async (channel, message) => {
          if (channel !== RESULT_CHANNEL) return;

          let data;
          try {
            data = JSON.parse(message);
          } catch {
            return;
          }

          if (data?.scanId !== scanId) return;

          if (!gotAnyMessageForScan) {
            gotAnyMessageForScan = true;
            clearTimeout(noMsgTimeout);
          }

          // Live progress updates from Python worker
          if (data.type === 'progress') {
            scan.progress = data.progress;
            await scan.save();
            publishScanUpdate(jobQueueApp(), { type: 'progress', scanId, progress: data.progress });
            return;
          }

          // Final results
          clearTimeout(totalTimeout);
          cleanup();
          resolve(data);
        };

        // Wrap the async handler to avoid unhandled promise rejections from EventEmitter.
        const onMessage = (channel, message) => {
          void handleMessage(channel, message).catch((e) => {
            cleanup();
            reject(e);
          });
        };

        sub.on('message', onMessage);

        // Publish job *after* we're subscribed and listening.
        const effectiveProfile =
          Array.isArray(scanProfile) && scanProfile.length
            ? scanProfile
            : Array.isArray(scan.scanProfile) && scan.scanProfile.length
              ? scan.scanProfile
              : null;

        pub
          .publish(
            JOB_CHANNEL,
            JSON.stringify({
              scanId,
              targetUrl: scan.targetUrl,
              scanProfile: effectiveProfile,
            })
          )
          .catch((e) => {
            cleanup();
            reject(e);
          });
      });

      await handleResults(scan, resultData);
    } finally {
      try {
        await sub.unsubscribe(RESULT_CHANNEL);
      } catch {}
      try {
        await sub.quit();
      } catch {}
    }
  });

  // Handle completed jobs
  scanQueue.on('completed', async (job) => {
    const { scanId, webhookUrl } = job.data;
    const scan = await Scan.findById(scanId);
    
    // Send email notification (skip for scheduled scans)
    if (scan && !scan.scheduled) {
      await sendScanSummaryEmail(scan);
    }

    // Call webhook if configured
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

  // Handle failed jobs
  scanQueue.on('failed', async (job, err) => {
    const { scanId, webhookUrl } = job.data;
    const scan = await Scan.findById(scanId);

    // Don't overwrite a scan that already completed successfully
    if (scan && scan.status !== 'completed') {
      scan.status = 'failed';
      scan.error = err.message;
      // Keep whatever progress was reached — don't reset to 0
      await scan.save();
      await sendScanFailureEmail(scan, err.message);

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

// Reference to Express app for SSE notifications
let _app = null;
export const setJobQueueApp = (app) => { _app = app; };
const jobQueueApp = () => _app;

/**
 * Process scan results from Python worker and save to database.
 */
async function handleResults(scan, data) {
  const results = data.results || [];

  scan.results = results;
  scan.progress = 100;
  scan.status = 'completed';
  scan.completedAt = new Date();
  await scan.save();

  publishScanUpdate(jobQueueApp(), {
    type: 'completed',
    scanId: scan._id.toString(),
    progress: 100,
    status: 'completed',
  });

  return true;
}