import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { ensureReportDir } from '../utils/reportDir.js';
import { getSeverityRank } from '../utils/severity.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';
import Scan from '../models/Scan.js';
import { computeScanDiff } from './scanDiff.js';

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

function sanitizeName(s = '') {
  return String(s).replace(/[^a-z0-9\-_.]/gi, '_');
}

function getHostLabel(scan) {
  if (scan?.targetHost) return scan.targetHost;
  try {
    return new URL(scan.targetUrl).hostname;
  } catch {
    return 'site';
  }
}

function makeExportBase(scan) {
  const host = sanitizeName(getHostLabel(scan));
  const id = sanitizeName(scan?._id?.toString() || 'scan');
  return `${host}_${id}`;
}

async function generatePdfExport(scan, { summaryLines = [], topFindings = [] } = {}) {
  const reportDir = ensureReportDir();
  const base = makeExportBase(scan);
  const fileName = `${base}_security_report.pdf`;
  const filePath = path.join(reportDir, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const ws = fs.createWriteStream(filePath);

    ws.on('finish', resolve);
    ws.on('error', reject);
    doc.on('error', reject);

    doc.pipe(ws);

    const host = getHostLabel(scan);

    doc.font('Helvetica-Bold').fontSize(18).text('Lumen Scan Summary');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`Target: ${scan.targetUrl}`);
    doc.text(`Host: ${host}`);
    if (scan.completedAt) doc.text(`Completed: ${new Date(scan.completedAt).toISOString()}`);
    doc.text(`Scan ID: ${scan._id?.toString()}`);

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Summary');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151');

    (summaryLines.length ? summaryLines : ['No summary available.']).forEach((line) => {
      doc.text(`• ${line}`);
    });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Findings (top)');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151');

    if (!topFindings.length) {
      doc.text('No findings.');
    } else {
      topFindings.slice(0, 25).forEach((f) => {
        const sev = String(f.severity || 'info').toUpperCase();
        doc.text(`• [${sev}] ${String(f.title || '').trim()}`);
      });
    }

    doc.end();
  });

  return { fileName, filePath };
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
    if (!hasComparison) {
      subject = `[Lumen] Scan complete (baseline) — ${targetLabel}`;
    } else if (importance === 'action_required') {
      subject = `[Lumen] Action needed: ${newHighCritical.length} new high/critical finding${newHighCritical.length === 1 ? '' : 's'} — ${targetLabel}`;
    } else if (newIssues.length) {
      subject = `[Lumen] Scan complete: ${newIssues.length} new finding${newIssues.length === 1 ? '' : 's'} — ${targetLabel}`;
    } else if (fixedIssues.length) {
      subject = `[Lumen] Scan complete: ${fixedIssues.length} finding${fixedIssues.length === 1 ? '' : 's'} fixed — ${targetLabel}`;
    } else {
      subject = `[Lumen] Scan complete: no changes — ${targetLabel}`;
    }

    // Build a clean, readable email body
    const lines = [];
    lines.push(`Hi ${user.username || 'there'},`);
    lines.push('');
    lines.push(`Your scan for ${scan.targetUrl} has finished.`);
    lines.push('');

    if (total === 0) {
      lines.push('No findings were recorded.');
    } else {
      lines.push(`Findings: ${total} total (Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low})`);
    }

    if (hasComparison) {
      lines.push('');
      lines.push(`Changes since last scan:`);
      lines.push(`  New: ${newIssues.length}   Fixed: ${fixedIssues.length}   Still present: ${persisting.length}`);

      if (importance === 'action_required') {
        lines.push('');
        lines.push(`⚠  ${newHighCritical.length} new high/critical issue${newHighCritical.length === 1 ? '' : 's'} — review recommended.`);
      }
    } else {
      lines.push('');
      lines.push('This is a baseline scan — no previous scan to compare against.');
    }

    lines.push('');
    lines.push('The full report is attached as a PDF.');
    lines.push('');
    lines.push('— Lumen');

    const summaryLines = [];
    if (total === 0) {
      summaryLines.push('No findings were recorded by the current scan profile.');
    } else {
      summaryLines.push(`Total: ${total} findings (Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}, Info: ${counts.info})`);
    }

    if (hasComparison) {
      summaryLines.push(`Changes: New ${newIssues.length} · Fixed ${fixedIssues.length} · Persisting ${persisting.length}`);
    }

    const topFindings = sortFindings(results).slice(0, 10);
    const pdfExport = await generatePdfExport(scan, { summaryLines, topFindings });

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
