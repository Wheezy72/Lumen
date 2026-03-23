import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { ensureReportDir } from '../utils/reportDir.js';
import { getSeverityRank } from '../utils/severity.js';
import { createObjectCsvWriter } from 'csv-writer';
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

async function generateCsvExport(scan) {
  const reportDir = ensureReportDir();
  const base = makeExportBase(scan);
  const fileName = `${base}_findings.csv`;
  const filePath = path.join(reportDir, fileName);

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'severity', title: 'Severity' },
      { id: 'title', title: 'Title' },
      { id: 'category', title: 'Category' },
      { id: 'cve', title: 'CVE' },
      { id: 'description', title: 'Description' },
      { id: 'evidence', title: 'Evidence' },
    ],
  });

  const rows = (scan.results || []).map((v) => ({
    severity: v.severity || 'info',
    title: v.title || '',
    category: v.category || '',
    cve: v.cve || '',
    description: v.description || '',
    evidence: v.evidence || '',
  }));

  await csvWriter.writeRecords(rows);

  const urlName = encodeURIComponent(fileName);
  const downloadUrl = `/api/reports/file/${urlName}?download=${encodeURIComponent(fileName)}`;

  return { fileName, filePath, downloadUrl };
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

  const urlName = encodeURIComponent(fileName);
  const downloadUrl = `/api/reports/file/${urlName}?download=${encodeURIComponent(fileName)}`;

  return { fileName, filePath, downloadUrl };
}

export async function sendPasswordResetCodeEmail({ to, username, code }) {
  if (!isEmailEnabled()) {
    throw new Error('Email is not enabled (EMAIL_ENABLED is false)');
  }

  const subject = '[Lumen] Password reset code';
  const text = [
    `A password reset was requested for: ${username || 'your account'}`,
    '',
    `Your reset code is: ${code}`,
    'This code expires in 15 minutes.',
    '',
    'If you did not request this, you can ignore this message.',
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
      const severity = (finding.severity || 'info').toLowerCase();
      counts[severity] = (counts[severity] || 0) + 1;
    });

    

    const sortFindings = (arr) =>
      [...(arr || [])].sort((a, b) => {
        const d = getSeverityRank(b.severity) - getSeverityRank(a.severity);
        if (d) return d;
        return String(a.title || '').localeCompare(String(b.title || ''));
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

    const newHighCritical = newIssues.filter((finding) => {
      const s = String(finding.severity || 'info').toLowerCase();
      return s === 'high' || s === 'critical';
    });

    const importance = newHighCritical.length ? 'action_required' : (newIssues.length ? 'review' : 'none');

    let subject = `[Lumen] Scan complete for ${targetLabel}`;
    if (!hasComparison) {
      subject = `[Lumen] Scan complete (baseline) for ${targetLabel}`;
    } else if (importance === 'action_required') {
      subject = `[Lumen] Action needed: ${newHighCritical.length} new high/critical finding${newHighCritical.length === 1 ? '' : 's'} for ${targetLabel}`;
    } else if (newIssues.length) {
      subject = `[Lumen] Scan complete: ${newIssues.length} new finding${newIssues.length === 1 ? '' : 's'} for ${targetLabel}`;
    } else if (fixedIssues.length) {
      subject = `[Lumen] Scan complete: ${fixedIssues.length} finding${fixedIssues.length === 1 ? '' : 's'} fixed for ${targetLabel}`;
    } else {
      subject = `[Lumen] Scan complete: no changes for ${targetLabel}`;
    }

    const summaryLines = [];
    if (total === 0) {
      summaryLines.push('No findings were recorded by the current scan profile.');
    } else {
      summaryLines.push(`Total findings: ${total} (Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}, Info: ${counts.info}).`);
    }

    if (!hasComparison) {
      summaryLines.push('No previous scan was available to compare against (baseline run).');
    } else {
      summaryLines.push(`Changes since previous scan: New: ${newIssues.length}, Fixed: ${fixedIssues.length}, Still present: ${persisting.length}.`);

      if (importance === 'action_required') {
        summaryLines.push(`Important: ${newHighCritical.length} new high/critical issue${newHighCritical.length === 1 ? '' : 's'} detected.`);
      } else if (newIssues.length) {
        summaryLines.push('New issues were detected; review recommended.');
      } else {
        summaryLines.push('No new issues were detected compared to the previous scan.');
      }
    }

    const topFindings = sortFindings(results).slice(0, 10);

    const [pdfExport, csvExport] = await Promise.all([
      generatePdfExport(scan, { summaryLines, topFindings }),
      generateCsvExport(scan),
    ]);

    const lines = [];
    lines.push(`Scan summary for ${scan.targetUrl}`);
    lines.push('');
    summaryLines.forEach((l) => lines.push(`- ${l}`));
    lines.push('');
    lines.push('Exports');
    lines.push(`- PDF: ${pdfExport.fileName} (${pdfExport.downloadUrl})`);
    lines.push(`- CSV: ${csvExport.fileName} (${csvExport.downloadUrl})`);
    lines.push('');
    lines.push('Note: Download links require you to be signed in to Lumen.');

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
      attachments: [
        { filename: pdfExport.fileName, path: pdfExport.filePath },
        { filename: csvExport.fileName, path: csvExport.filePath },
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

