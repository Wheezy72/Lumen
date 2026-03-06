import Bull from 'bull';
import Scan from '../models/Scan.js';
import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import fetch from 'node-fetch';
import Redis from 'ioredis';
import { sendScanSummaryEmail, sendScanFailureEmail } from '../services/email.js';

/**
 * Queue wiring for scan jobs.
 * 
 * This module connects Express, Bull (job queue), and the Python worker:
 * 1. Receives scan requests from the API
 * 2. Publishes jobs to Redis for the Python worker
 * 3. Waits for results and updates the database
 * 4. Sends real-time updates via SSE
 * 5. Triggers email notifications on completion
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const scanQueue = new Bull('scanQueue', REDIS_URL);

// Redis pub/sub for Python worker communication
const redis = new Redis(REDIS_URL);
const pub = new Redis(REDIS_URL);
const RESULT_CHANNEL = 'scan_results';
const JOB_CHANNEL = 'scan_jobs';

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

    // Send job to Python worker with scan profile (selected modules)
    await pub.publish(JOB_CHANNEL, JSON.stringify({
      scanId,
      targetUrl: scan.targetUrl,
      scanProfile: scanProfile || scan.scanProfile || null,
    }));

    // Wait for results from Python worker (with 15 minute timeout)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout - scan took too long'));
      }, 15 * 60 * 1000);

      const onMessage = async (channel, message) => {
        if (channel !== RESULT_CHANNEL) return;
        
        const data = JSON.parse(message);
        if (data.scanId !== scanId) return;
        
        clearTimeout(timeout);
        redis.off('message', onMessage);
        resolve(handleResults(scan, data));
      };

      redis.on('message', onMessage);
      redis.subscribe(RESULT_CHANNEL);
    });
  });

  // Handle completed jobs
  scanQueue.on('completed', async (job) => {
    const { scanId, webhookUrl } = job.data;
    const scan = await Scan.findById(scanId);
    
    // Send email notification (skip for scheduled scans - they have their own handler)
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
    
    if (scan) {
      scan.status = 'failed';
      scan.error = err.message;
      scan.progress = 0;
      await scan.save();
      await sendScanFailureEmail(scan, err.message);
    }

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

    publishScanUpdate(jobQueueApp(), { type: 'failed', scanId, error: err.message });
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
    type: 'progress',
    scanId: scan._id.toString(),
    progress: 100,
  });

  return true;
}