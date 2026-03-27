import Scan from '../models/Scan.js';
import { logger } from '../utils/logger.js';
import { publishScanUpdate } from '../routes/sse.js';
import { computeScanDiff } from '../services/scanDiff.js';

export default async function handleResults(scan, data, jobQueueApp) {
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
