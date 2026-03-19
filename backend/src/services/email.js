import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';
import Scan from '../models/Scan.js';
import { computeScanDiff } from './scanDiff.js';

/**
 * Simple email helper used to notify users about scan results.
 * This is intentionally small and direct: if sending fails, the error
 * is logged and the scan flow continues without retry logic.
 */

const {
  EMAIL_ENABLED = 'false',
  EMAIL_FROM = 'alerts@example.com',
  SMTP_HOST = 'localhost',
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
} = process.env;

let transporter = null;

function isEmailEnabled() {
  return ['true', '1', 'yes', 'on'].includes(String(EMAIL_ENABLED || '').toLowerCase());
}

function getTransporter() {
  if (!transporter) {
    const port = parseInt(SMTP_PORT, 10);

    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendScanSummaryEmail(scan) {
  if (!isEmailEnabled()) return;

  try {
    const user = await User.findById(scan.userId);
    if (!user?.email || !user.emailAlertsEnabled) return;

    const results = scan.results || [];
    const total = results.length;

    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    results.forEach((finding) => {
      const severity = (finding.severity || 'info').toLowerCase();
      counts[severity] = (counts[severity] || 0) + 1;
    });

    const targetLabel = scan.targetHost || scan.targetUrl;

    const severityRank = (sev) => {
      const s = String(sev || 'info').toLowerCase();
      if (s === 'critical') return 4;
      if (s === 'high') return 3;
      if (s === 'medium') return 2;
      if (s === 'low') return 1;
      return 0;
    };

    const sortFindings = (arr) =>
      [...(arr || [])].sort((a, b) => {
        const d = severityRank(b.severity) - severityRank(a.severity);
        if (d) return d;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });

    let compareScan = null;
    let diff = null;
    const compareScanId = scan.diffSummary?.compareScanId;

    if (compareScanId) {
      compareScan = await Scan.findOne({
        _id: compareScanId,
        userId: scan.userId,
        status: 'completed',
      }).select('results createdAt completedAt');

      if (compareScan) {
        diff = computeScanDiff(compareScan.results || [], results);
      }
    }

    const newIssues = sortFindings(diff?.newIssues || []);
    const fixedIssues = sortFindings(diff?.fixedIssues || []);
    const persisting = sortFindings(diff?.persisting || []);

    const newHighCritical = newIssues.filter((finding) => {
      const severity = (finding.severity || 'info').toLowerCase();
      return severity === 'high' || severity === 'critical';
    });

    const hasComparison = Boolean(compareScan && diff);

    let subject = `[Lumen] Scan complete for ${targetLabel}`;
    if (hasComparison) {
      if (newIssues.length) {
        subject = `[Lumen] Scan complete – ${newIssues.length} new finding${newIssues.length === 1 ? '' : 's'} for ${targetLabel}`;
      } else if (!fixedIssues.length) {
        subject = `[Lumen] Scan complete – no changes for ${targetLabel}`;
      }
    }

    const lines = [];

    lines.push(`Scan complete for: ${scan.targetUrl}`);
    lines.push('');

    if (total === 0) {
      lines.push('Findings: none');
    } else {
      lines.push(`Total findings: ${total}`);
      lines.push(`Critical: ${counts.critical}  High: ${counts.high}  Medium: ${counts.medium}  Low: ${counts.low}  Info: ${counts.info}`);
    }

    if (!hasComparison) {
      lines.push('');
      lines.push('Changes since last scan: not available (first recorded scan for this site).');
    } else {
      lines.push('');
      lines.push('Changes since last scan:');
      lines.push(`New: ${newIssues.length}  Fixed: ${fixedIssues.length}  Still present: ${persisting.length}`);

      if (newIssues.length === 0 && fixedIssues.length === 0) {
        lines.push('No changes were detected compared to the previous scan.');
      } else {
        if (newIssues.length === 0) {
          lines.push('No new findings were introduced compared to the previous scan.');
        }
        if (fixedIssues.length === 0) {
          lines.push('No findings were fixed since the previous scan.');
        }
      }

      if (newHighCritical.length) {
        lines.push('');
        lines.push(`Warning: ${newHighCritical.length} new high/critical finding${newHighCritical.length === 1 ? '' : 's'} detected.`);
        newHighCritical.slice(0, 5).forEach((finding) => {
          lines.push(`- [${(finding.severity || 'info').toUpperCase()}] ${finding.title}`);
        });
        if (newHighCritical.length > 5) {
          lines.push(`  ...and ${newHighCritical.length - 5} more.`);
        }
      }

      if (newIssues.length) {
        lines.push('');
        lines.push('New findings:');
        newIssues.slice(0, 5).forEach((finding) => {
          lines.push(`- [${(finding.severity || 'info').toUpperCase()}] ${finding.title}`);
        });
        if (newIssues.length > 5) {
          lines.push(`  ...and ${newIssues.length - 5} more.`);
        }
      }

      if (fixedIssues.length) {
        lines.push('');
        lines.push('Fixed since last scan:');
        fixedIssues.slice(0, 5).forEach((finding) => {
          lines.push(`- [${(finding.severity || 'info').toUpperCase()}] ${finding.title}`);
        });
        if (fixedIssues.length > 5) {
          lines.push(`  ...and ${fixedIssues.length - 5} more.`);
        }
      }
    }

    if (total) {
      const top = sortFindings(results).slice(0, 5);

      lines.push('');
      lines.push('Top findings in this scan:');
      top.forEach((finding) => {
        lines.push(`- [${(finding.severity || 'info').toUpperCase()}] ${finding.title}`);
      });
      if (total > 5) {
        lines.push(`  ...and ${total - 5} more.`);
      }
    }

    lines.push('');
    lines.push('Open the Lumen dashboard to view the full report and export a PDF/CSV if needed.');

    logger.debug('Sending scan summary email', {
      to: user.email,
      scanId: scan?._id?.toString(),
      target: scan.targetUrl,
      totalFindings: total,
      smtpHost: SMTP_HOST,
      smtpPort: SMTP_PORT,
      smtpSecure: parseInt(SMTP_PORT, 10) === 465,
      smtpAuth: Boolean(SMTP_USER && SMTP_PASS),
    });

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text: lines.join('\n'),
    });
  } catch (e) {
    logger.warn('Failed to send scan summary email', {
      error: e.message,
      code: e.code,
      response: e.response,
      command: e.command,
    });
  }
}

export async function sendScanFailureEmail(scan, errorMessage) {
  if (!isEmailEnabled()) return;

  try {
    const user = await User.findById(scan.userId);
    if (!user?.email || !user.emailAlertsEnabled) return;

    const subject = `[Lumen] Scan failed for ${scan.targetUrl}`;
    const text = [
      `A scan for ${scan.targetUrl} did not complete successfully.`,
      '',
      `Error: ${errorMessage}`,
      '',
      'Log in to the dashboard to see more details and try again.',
    ].join('\n');

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text,
    });
  } catch (e) {
    logger.warn('Failed to send scan failure email', {
      error: e.message,
      code: e.code,
      response: e.response,
      command: e.command,
    });
  }
}

export async function sendScheduledScanDiffEmail(scan, diff) {
  if (!isEmailEnabled()) return;

  try {
    const user = await User.findById(scan.userId);
    if (!user?.email || !user.emailAlertsEnabled) return;

    const all = scan.results || [];
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    all.forEach((v) => {
      const sev = v.severity || 'low';
      counts[sev] = (counts[sev] || 0) + 1;
    });

    const newIssues = diff?.newIssues || [];
    const persisting = diff?.persisting || [];

    const newHighCritical = newIssues.filter(
      (v) => v.severity === 'high' || v.severity === 'critical',
    );
    const persistingHighCritical = persisting.filter(
      (v) => v.severity === 'high' || v.severity === 'critical',
    );

    const subjectParts = ['[Lumen] Scheduled scan'];
    subjectParts.push(`for ${scan.targetUrl}`);
    if (newHighCritical.length) {
      subjectParts.push('– new high-risk issues detected');
    }

    const lines = [];

    lines.push(`A scheduled scan completed for: ${scan.targetUrl}`);
    lines.push('');
    lines.push(
      `Total findings: ${all.length} (Critical: ${counts.critical}  High: ${counts.high}  Medium: ${counts.medium}  Low: ${counts.low})`,
    );

    if (!diff) {
      lines.push('');
      lines.push('This is the first recorded scan for this site, so there is no previous run to compare against.');
    }

    if (newIssues.length) {
      lines.push('');
      lines.push('New findings since the previous scan:');
      newIssues.slice(0, 10).forEach((v) => {
        lines.push(`- [${(v.severity || 'low').toUpperCase()}] ${v.title} (${v.category || 'general'})`);
      });
      if (newIssues.length > 10) {
        lines.push(`  ...and ${newIssues.length - 10} more.`);
      }
    }

    if (persistingHighCritical.length) {
      lines.push('');
      lines.push('Important findings still present (also seen in the previous scan):');
      persistingHighCritical.slice(0, 10).forEach((v) => {
        lines.push(`- [${(v.severity || 'low').toUpperCase()}] ${v.title} (${v.category || 'general'})`);
      });
      if (persistingHighCritical.length > 10) {
        lines.push(`  ...and ${persistingHighCritical.length - 10} more.`);
      }
    }

    lines.push('');
    lines.push('Log in to the dashboard to review the full report and export a PDF if needed.');

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: subjectParts.join(' '),
      text: lines.join('\n'),
    });
  } catch (e) {
    logger.warn('Failed to send scheduled scan diff email', {
      error: e.message,
      code: e.code,
      response: e.response,
      command: e.command,
    });
  }
}