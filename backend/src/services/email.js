import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { getSeverityRank } from '../utils/severity.js';
import User from '../models/User.js';
import Scan from '../models/Scan.js';
import { computeScanDiff } from './scanDiff.js';
import { generatePdfForScan } from '../utils/pdfReport.js';



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


export async function sendPasswordResetCodeEmail({ to, username, code }) {
  if (!isEmailEnabled()) {
    throw new Error('Email is not enabled (EMAIL_ENABLED is false)');
  }

  const subject = '[Lumen] Your password reset code';
  const text = [
    `Hi ${username || 'there'},`,
    '',
    'Someone requested a password reset for your Lumen account.',
    '',
    `Reset code: ${code}`,
    '(expires in 15 minutes)',
    '',
    "If that wasn't you, just ignore this email.",
    '',
    '— Lumen',
  ].join('\n');

  await getTransporter().sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
  });
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
      const sev = (finding.severity || 'info').toLowerCase();
      counts[sev] = (counts[sev] || 0) + 1;
    });

    const sortFindings = (arr) =>
      [...(arr || [])].sort((a, b) => {
        const d = getSeverityRank(b.severity) - getSeverityRank(a.severity);
        return d || String(a.title || '').localeCompare(String(b.title || ''));
      });

    const targetLabel = getHostLabel(scan);

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

    const hasComparison = Boolean(compareScan && diff);
    const newIssues = sortFindings(diff?.newIssues || []);
    const fixedIssues = sortFindings(diff?.fixedIssues || []);
    const persisting = sortFindings(diff?.persisting || []);

    const newHighCritical = newIssues.filter((f) => {
      const s = String(f.severity || '').toLowerCase();
      return s === 'high' || s === 'critical';
    });

    const importance = newHighCritical.length ? 'action_required' : (newIssues.length ? 'review' : 'none');

    let subject;
    // ── Emoji subject line ──────────────────────────────────────────────────
    const isClean = total === 0;
    const hasCriticalOrHigh = (counts.critical + counts.high) > 0;
    const hasMediumOrLow    = (counts.medium + counts.low) > 0;

    if (!hasComparison) {
      if (isClean) {
        subject = `✅ [Lumen] Clean baseline scan — ${targetLabel}`;
      } else if (hasCriticalOrHigh) {
        subject = `🚨 [Lumen] Baseline scan — ${counts.critical + counts.high} critical/high finding${(counts.critical + counts.high) === 1 ? '' : 's'} — ${targetLabel}`;
      } else if (hasMediumOrLow) {
        subject = `⚠️ [Lumen] Baseline scan — ${total} finding${total === 1 ? '' : 's'} — ${targetLabel}`;
      } else {
        subject = `[Lumen] Baseline scan complete — ${targetLabel}`;
      }
    } else if (importance === 'action_required') {
      subject = `🚨 [Lumen] Action needed: ${newHighCritical.length} new critical/high finding${newHighCritical.length === 1 ? '' : 's'} — ${targetLabel}`;
    } else if (newIssues.length) {
      subject = `⚠️ [Lumen] Scan complete: ${newIssues.length} new finding${newIssues.length === 1 ? '' : 's'} — ${targetLabel}`;
    } else if (fixedIssues.length && isClean) {
      subject = `✅ [Lumen] All clear: ${fixedIssues.length} issue${fixedIssues.length === 1 ? '' : 's'} fixed — ${targetLabel}`;
    } else if (fixedIssues.length) {
      subject = `🚧 [Lumen] Scan complete: ${fixedIssues.length} finding${fixedIssues.length === 1 ? '' : 's'} fixed — ${targetLabel}`;
    } else if (isClean) {
      subject = `✅ [Lumen] Clean scan — no issues — ${targetLabel}`;
    } else {
      subject = `[Lumen] Scan complete: no changes — ${targetLabel}`;
    }

    // ── Email body ──────────────────────────────────────────────────────────
    const lines = [];
    lines.push(`Hi ${user.username || 'there'},`);
    lines.push('');

    if (isClean) {
      // ── Clean scan tone ───────────────────────────────────────────────────
      lines.push(`🎉 Great news! Your scan for ${scan.targetUrl} came back clean.`);
      lines.push('');
      lines.push('🛡️  No security issues were detected by the active scan profile.');
      lines.push('');
      lines.push('Keep up the good work. Regular scanning helps you catch regressions early.');
    } else if (hasCriticalOrHigh) {
      // ── Urgent tone ───────────────────────────────────────────────────────
      lines.push(`🚨 Your scan for ${scan.targetUrl} has finished with issues that need immediate attention.`);
      lines.push('');
      lines.push(`🛑 Findings: ${total} total`);
      lines.push(`   Critical: ${counts.critical}  |  High: ${counts.high}  |  Medium: ${counts.medium}  |  Low: ${counts.low}`);
      lines.push('');
      lines.push('Critical and high severity findings should be reviewed and remediated as a priority.');
      lines.push('');

      // List the top critical/high findings with UPPERCASE titles
      const urgentFindings = sortFindings(results)
        .filter(f => { const s = String(f.severity || '').toLowerCase(); return s === 'critical' || s === 'high'; })
        .slice(0, 10);

      if (urgentFindings.length) {
        lines.push('Top findings requiring immediate action:');
        urgentFindings.forEach((f, i) => {
          const sev = String(f.severity || '').toUpperCase();
          const title = String(f.title || f.category || 'UNKNOWN').toUpperCase();
          lines.push(`  🛑 ${i + 1}. [${sev}] ${title}`);
        });
      }

    } else {
      // ── Warning tone ──────────────────────────────────────────────────────
      lines.push(`⚠️  Your scan for ${scan.targetUrl} has finished.`);
      lines.push('');
      lines.push(`Findings: ${total} total (Medium: ${counts.medium}, Low: ${counts.low})`);
      lines.push('');
      lines.push('🚧 No critical or high severity issues were detected, but the findings above are worth reviewing.');
    }

    if (hasComparison) {
      lines.push('');
      lines.push('Changes since last scan:');
      lines.push(`  New: ${newIssues.length}   Fixed: ${fixedIssues.length}   Still present: ${persisting.length}`);

      if (importance === 'action_required') {
        lines.push('');
        lines.push(`🚨  ${newHighCritical.length} new critical/high issue${newHighCritical.length === 1 ? '' : 's'} — immediate review recommended.`);
      }
    } else {
      lines.push('');
      lines.push('This is a baseline scan — no previous scan to compare against.');
    }

    lines.push('');
    lines.push('The full report is attached as a PDF.');
    lines.push('');
    lines.push('— Lumen');


    const pdfExport = await generatePdfForScan(scan);



    logger.debug('Sending scan summary email', {
      to: user.email,
      scanId: scan?._id?.toString(),
      target: scan.targetUrl,
      totalFindings: total,
    });

    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text: lines.join('\n'),
      attachments: [
        { filename: pdfExport.fileName, path: pdfExport.filePath },
      ],
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

    const subject = `[Lumen] Scan failed — ${scan.targetUrl}`;
    const text = [
      `Hi ${user.username || 'there'},`,
      '',
      `A scan for ${scan.targetUrl} didn't complete.`,
      '',
      `Error: ${errorMessage}`,
      '',
      'Log in to the dashboard to see more details or try again.',
      '',
      '— Lumen',
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
