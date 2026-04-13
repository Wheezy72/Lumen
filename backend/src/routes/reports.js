import express from 'express';
import Joi from 'joi';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';
import Scan from '../models/Scan.js';
import { displayFindingTitle, getHeaderHintForTitle } from '../services/findingTitle.js';
import { ensureReportDir } from '../utils/reportDir.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportSchema = Joi.object({
  scanId: Joi.string().required(),
});

function sanitizeName(s = '') {
  return s.replace(/[^a-z0-9\-_.]/gi, '_');
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  // ISO-like but readable, without timezone suffixes.
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function makeBaseName(scan) {
  let host = 'site';
  try {
    host = new URL(scan.targetUrl).hostname || 'site';
  } catch {
    // ignore invalid URL
  }
  return sanitizeName(host);
}

function describeDetection(vuln = {}) {
  const category = vuln.category || '';
  switch (category) {
    case 'xss':
      return 'The scanner added a harmless script tag to the URL and checked whether it was reflected in the response.';
    case 'sqli':
      return 'The scanner added test input to the URL and checked the response for database error messages.';
    case 'headers':
      return 'The scanner checked the HTTP response for commonly recommended security headers.';
    case 'ssl':
      return 'The scanner opened a TLS connection and inspected the certificate and negotiated protocol.';
    case 'traversal':
      return 'The scanner requested traversal-style paths and checked whether sensitive file content appeared in the response.';
    case 'subdomain':
      return 'The scanner tried resolving a small set of common subdomains (for example: www, api, dev).';
    case 'cookies':
      return 'The scanner inspected Set-Cookie headers to see which security flags were applied.';
    case 'error':
      return 'The scanner sent a harmless request and checked the response for stack traces or verbose error messages.';
    case 'access_control':
      return 'The scanner modified a numeric identifier in the URL and compared responses to look for access control issues.';
    case 'rate_limit':
      return 'The scanner sent a short burst of requests and checked for rate limiting signals such as HTTP 429 or Retry-After headers.';
    case 'policy':
      return 'The scanner checked whether the hostname can be scanned under the current worker configuration.';
    case 'network':
      return 'The scanner attempted DNS resolution for the host and recorded any errors.';
    case 'http':
      return 'The scanner sent a basic HTTP request and recorded any connection or protocol errors.';
    default:
      return 'This issue was found by running a small set of automated checks against the site.';
  }
}

function mitigationAdvice(vuln = {}) {
  const category = vuln.category || '';
  switch (category) {
    case 'xss':
      return 'Encode untrusted data before rendering, validate input on both client and server, and consider a strict Content-Security-Policy.';
    case 'sqli':
      return 'Use parameterised queries or an ORM, avoid concatenating raw user input into SQL, and apply input validation.';
    case 'headers':
      return 'Add common security headers like Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and HSTS at your edge or application server.';
    case 'ssl':
      return 'Disable legacy TLS versions, use modern cipher suites, and ensure the certificate is valid, not expired, and issued for the correct hostname.';
    case 'traversal':
      return 'Never trust raw file paths from users. Use whitelists, map IDs to paths server-side, and normalise paths before accessing the filesystem.';
    case 'subdomain':
      return 'Regularly inventory your subdomains, lock down test and staging systems, and remove or protect anything that is not meant to be public.';
    case 'cookies':
      return 'Mark sensitive cookies as HttpOnly and Secure, set an appropriate SameSite policy, and avoid exposing session identifiers to client-side scripts.';
    case 'error':
      return 'Return generic error messages to clients, log detailed errors server-side, and disable verbose stack traces in production builds.';
    case 'access_control':
      return 'Enforce authorisation checks on every request server-side, avoid trusting IDs from the client, and use per-user or per-tenant access rules.';
    case 'rate_limit':
      return 'Introduce rate limiting or throttling on sensitive endpoints such as login or password reset, and monitor for repeated failed attempts.';
    case 'policy':
      return 'Explicitly decide which hosts and environments may be scanned, and update the worker configuration or firewall rules to match that policy.';
    case 'network':
      return 'Confirm the DNS records for this host are correct and reachable from where the scanner is running.';
    case 'http':
      return 'Check connectivity, proxies, and TLS configuration between the scanner and the target, and review any reverse proxy or WAF rules.';
    default:
      return 'Review this finding, confirm whether it is real, and then apply a code, configuration, or infrastructure change that removes the root cause.';
  }
}

// Serve: GET /api/reports/file/:name (sets content-disposition)
router.get('/file/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    const reportDir = ensureReportDir();
    const abs = path.join(reportDir, name);
    if (!abs.startsWith(reportDir)) return res.status(400).end(); // path safety
    if (!fs.existsSync(abs)) return res.status(404).end();

    const downloadName = req.query.download || name;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.sendFile(abs);
  } catch (e) {
    next(e);
  }
});

async function generatePdfReport(scan) {
  const reportDir = ensureReportDir();
  const base = `${makeBaseName(scan)}_security_report`;
  const fileName = `${base}.pdf`;
  const filePath = path.join(reportDir, fileName);

  const doc = new PDFDocument({ margin: 40 });
  const ws = fs.createWriteStream(filePath);

  doc.pipe(ws);

  let host = 'site';
  try {
    host = new URL(scan.targetUrl).hostname || 'site';
  } catch {
    // ignore invalid URL
  }

  const headerY = doc.y;
  doc.rect(0, headerY, doc.page.width, 92).fill('#0b1220');
  doc.rect(0, headerY + 90, doc.page.width / 2, 2).fill('#2563eb');
  doc.rect(doc.page.width / 2, headerY + 90, doc.page.width / 2, 2).fill('#10b981');
  doc.fillColor('#ffffff');

  let logoWidth = 0;
  try {
    const logoPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.jpg');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 44, headerY + 22, { fit: [44, 44] });
      logoWidth = 54;
    }
  } catch {
    // ignore
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('Security Scan Report', 44 + logoWidth, headerY + 22, { continued: false });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#cbd5e1')
    .text(host, 44 + logoWidth, headerY + 44);

  doc
    .fontSize(9)
    .fillColor('#94a3b8')
    .text(`Generated: ${formatDateTime(new Date())}`, 44 + logoWidth, headerY + 62);

  doc.y = headerY + 104;
  doc.fillColor('#111827');

  const results = scan.results || [];
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  results.forEach(v => {
    const sev = v.severity || 'low';
    counts[sev] = (counts[sev] || 0) + 1;
  });

  const highestSeverity = results.reduce((acc, v) => {
    const order = { low: 1, medium: 2, high: 3, critical: 4 };
    const sev = v.severity || 'low';
    return order[sev] > order[acc] ? sev : acc;
  }, 'low');

  doc.fontSize(14).fillColor('#111827').text('Executive Summary', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151')
    .text(
      results.length
        ? `This report summarises automated security checks run against ${host}. The highest observed severity is ${highestSeverity.toUpperCase()}, with a total of ${results.length} findings. The most important fixes relate to input validation, session handling and basic hardening.`
        : `This report summarises automated security checks run against ${host}. No findings were recorded by the current scan profile.`,
    );
  doc.moveDown(0.5);
  doc.text(`Findings by severity: Critical: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}`);
  doc.moveDown(1);

  doc.fontSize(14).fillColor('#111827').text('Scope and Methodology', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#374151')
    .text('The scanner executed a set of lightweight, automated checks against the HTTP interface of the site:');
  doc.moveDown(0.2);

  const bullets = [
    'TLS/HTTPS configuration (certificate and protocol).',
    'Presence of common HTTP security headers.',
    'Reflected Cross-Site Scripting (XSS) via query parameters.',
    'SQL injection-style input and error messages.',
    'Directory traversal attempts for sensitive files.',
    'Basic subdomain discovery via DNS lookups.',
    'Cookie and session flag configuration.',
    'Verbose error and stack trace exposure.',
    'Simple access control (IDOR-style) probes.',
    'Basic rate limiting / brute-force safety checks.',
  ];

  bullets.forEach((text) => {
    doc.text(`• ${text}`, { indent: 12 });
  });

  doc.moveDown(1);

  doc.strokeColor('#e5e7eb').roundedRect(40, doc.y, doc.page.width - 80, 80, 6).stroke();
  doc.moveDown(0.5).fontSize(12).fillColor('#111827').text(`Site: ${scan.targetUrl}`);
  doc.fontSize(10).fillColor('#374151');
  doc.text(`Status: ${scan.status}`);
  doc.text(`Started: ${formatDateTime(scan.startedAt)}`);
  doc.text(`Completed: ${formatDateTime(scan.completedAt)}`);
  doc.moveDown(1);

  const sevColor = (s = 'low') =>
    s === 'critical' ? '#dc2626' :
    s === 'high' ? '#ef4444' :
    s === 'medium' ? '#f59e0b' : '#10b981';

  doc.fontSize(14).fillColor('#111827').text('Detailed Findings', { underline: true });
  doc.moveDown(0.5);

  results.forEach((v, idx) => {
    const headerHint = getHeaderHintForTitle(v.title);
    const friendlyTitle = displayFindingTitle(v);
    const technicalTitle = String(v.title || '');
    const severity = (v.severity || 'low').toUpperCase();

    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fillColor('#111827').fontSize(12)
      .text(`${idx + 1}. ${friendlyTitle}`);
    doc.font('Helvetica-Bold').fillColor(sevColor(v.severity)).fontSize(10)
      .text(severity, { align: 'right' });

    if (technicalTitle && technicalTitle !== friendlyTitle) {
      doc.font('Helvetica').fillColor('#6b7280').fontSize(9)
        .text(`Technical: ${technicalTitle}`);
    }

    const metaParts = [];
    if (v.category) metaParts.push(`Category: ${String(v.category).replace(/_/g, ' ')}`);
    if (v.cve) metaParts.push(`CVE: ${v.cve}`);

    if (metaParts.length) {
      doc.font('Helvetica').fillColor('#374151').fontSize(10).text(metaParts.join(' • '));
    }

    if (v.description) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fillColor('#374151').fontSize(10).text(v.description);
    }

    if (headerHint) {
      doc.moveDown(0.15);
      doc.font('Helvetica').fillColor('#374151').fontSize(10).text(`What it means: ${headerHint.meaning}`);
    }

    if (v.evidence) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fillColor('#111827').fontSize(10).text('Evidence');
      doc.font('Helvetica').fillColor('#374151').fontSize(9).text(v.evidence, { indent: 12 });
    }

    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fillColor('#111827').fontSize(10).text('Detection method');
    doc.font('Helvetica').fillColor('#374151').fontSize(10).text(describeDetection(v));

    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').fillColor('#111827').fontSize(10).text('How to reduce the risk');
    doc.font('Helvetica').fillColor('#374151').fontSize(10).text(mitigationAdvice(v));

    doc.moveDown(0.35);
    doc.strokeColor('#e5e7eb').moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.strokeColor('#000');
  });

  doc.end();

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
    doc.on('error', reject);
  });

  const urlName = encodeURIComponent(fileName);
  const downloadUrl = `/api/reports/file/${urlName}?download=${encodeURIComponent(fileName)}`;

  return { fileName, downloadUrl };
}

router.post('/pdf', async (req, res, next) => {
  try {
    const { scanId } = await reportSchema.validateAsync(req.body, { stripUnknown: true });

    const scan = await Scan.findOne({ _id: scanId, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'I could not find that scan for this account.' });

    const { fileName, downloadUrl } = await generatePdfReport(scan);
    res.json({ url: downloadUrl, filename: fileName });
  } catch (e) {
    next(e);
  }
});

async function generateCsvReport(scan) {
  const reportDir = ensureReportDir();
  const base = `${makeBaseName(scan)}_findings`;
  const fileName = `${base}.csv`;
  const filePath = path.join(reportDir, fileName);

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'category', title: 'Category' },
      { id: 'severity', title: 'Severity' },
      { id: 'cve', title: 'CVE' },
      { id: 'description', title: 'Description' },
      { id: 'evidence', title: 'Evidence' },
    ],
  });

  const rows = (scan.results || []).map(v => ({
    title: v.title || '',
    category: v.category || '',
    severity: v.severity || 'low',
    cve: v.cve || '',
    description: v.description || '',
    evidence: v.evidence || '',
  }));

  await csvWriter.writeRecords(rows);

  const urlName = encodeURIComponent(fileName);
  const downloadUrl = `/api/reports/file/${urlName}?download=${encodeURIComponent(fileName)}`;

  return { fileName, downloadUrl };
}

router.post('/csv', async (req, res, next) => {
  try {
    const { scanId } = await reportSchema.validateAsync(req.body, { stripUnknown: true });

    const scan = await Scan.findOne({ _id: scanId, userId: req.user.id });
    if (!scan) return res.status(404).json({ error: 'I could not find that scan for this account.' });

    const { fileName, downloadUrl } = await generateCsvReport(scan);
    res.json({ url: downloadUrl, filename: fileName });
  } catch (e) {
    next(e);
  }
});

export default router;
