import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';

/**
 * Simple email helper used to notify developers about scan results.
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

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: false,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendScanSummaryEmail(scan) {
  if (EMAIL_ENABLED !== 'true') return;

  try {
    const user = await User.findById(scan.userId);
    if (!user?.email || !user.emailAlertsEnabled) return;

    const total = (scan.results || []).length;
    if (!total) {
      // If nothing was found, stay quiet. The dashboard still shows the result,
      // but there is no need to email about an empty report.
      return;
    }

    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    (scan.results || []).forEach((v) => {
      const sev = v.severity || 'low';
      counts[sev] = (counts[sev] || 0) + 1;
    });

    const subject = `[Lumen] Vulnerabilities found on ${scan.targetUrl}`;
    const topFindings = (scan.results || [])
      .slice(0, 3)
      .map((v) => `- [${(v.severity || 'low').toUpperCase()}] ${v.title}`)
      .join('\n');

    const text = [
      `A scan completed for: ${scan.targetUrl}`,
      '',
      `Total findings: ${total}`,
      `Critical: ${counts.critical}  High: ${counts.high}  Medium: ${counts.medium}  Low: ${counts.low}`,
      '',
      'Top findings:',
      topFindings,
      '',
      'You can log in to the Lumen dashboard to review the full report and export a PDF if needed.',
    ].join('\n');

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text,
    });
  } catch (e) {
    logger.warn('Failed to send scan summary email', { error: e.message });
  }
}

export async function sendScanFailureEmail(scan, errorMessage) {
  if (EMAIL_ENABLED !== 'true') return;

  try {
    const user = await User.findById(scan.userId);
    if (!user?.email || !user.emailAlertsEnabled) return;

    const subject = `[Lumen] Scan failed for ${scan.targetUrl}`;
    const text = [
      `A scan for ${scan.targetUrl} did not complete successfully.`,
      '',
      `Error: ${errorMessage}`,
      '',
      'You can log in to the Lumen dashboard to see more details and try again.',
    ].join('\n');

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text,
    });
  } catch (e) {
    logger.warn('Failed to send scan failure email', { error: e.message });
  }
}

/**
 * Diff-aware email for scheduled scans. This highlights new issues
 * compared with the previous scan, and reminds the developer about
 * important findings that are still present.
 */
export async function sendScheduledScanDiffEmail(scan, diff) {
  if (EMAIL_ENABLED !== 'true') return;

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
      lines.push('This is the first recorded scan for this target, so there is no previous run to compare against.');
    }

    if (newIssues.length) {
      lines.push('');
      lines.push('New findings since the previous scan:');
      newIssues.slice(0, 10).forEach((v) => {
        lines.push(
          `- [${(v.severity || 'low').toUpperCase()}] ${v.title} (${v.category || 'general'})`,
        );
      });
      if (newIssues.length > 10) {
        lines.push(`  ...and ${newIssues.length - 10} more.`);
      }
    }

    if (persistingHighCritical.length) {
      lines.push('');
      lines.push('Important findings still present (also seen in the previous scan):');
      persistingHighCritical.slice(0, 10).forEach((v) => {
        lines.push(
          `- [${(v.severity || 'low').toUpperCase()}] ${v.title} (${v.category || 'general'})`,
        );
      });
      if (persistingHighCritical.length > 10) {
        lines.push(`  ...and ${persistingHighCritical.length - 10} more.`);
      }
    }

    lines.push('');
    lines.push(
      'You can log in to the Lumen dashboard to review the full report, confirm which findings are real, and export a PDF if needed.',
    );

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: subjectParts.join(' '),
      text: lines.join('\n'),
    });
  } catch (e) {
    logger.warn('Failed to send scheduled scan diff email', { error: e.message });
  }
}