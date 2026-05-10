import express from 'express';
import Joi from 'joi';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';
import Scan from '../models/Scan.js';
import { displayFindingTitle } from '../services/findingTitle.js';
import { ensureReportDir } from '../utils/reportDir.js';
import { makePdfFileName, writePdfReport } from '../utils/pdfReport.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);


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
      return 'The scanner injected a harmless script-like payload into query parameters and checked whether it was reflected verbatim in the HTML response — a sign that the output is not being encoded.';
    case 'sqli':
      return 'The scanner added a simple SQL-shaped test string to query parameters and inspected the response for database error messages that indicate raw SQL is being executed.';
    case 'headers':
      return 'The scanner made a GET request and checked the HTTP response headers against a list of recommended security headers that browsers use to enforce additional protections.';
    case 'ssl':
      return 'The scanner opened a TLS connection and inspected the negotiated protocol version and certificate. TLS 1.0 and 1.1 are deprecated; only TLS 1.3 (recommended) and TLS 1.2 are acceptable.';
    case 'traversal':
      return 'The scanner added a path traversal sequence to a file-related query parameter and checked whether sensitive file content (such as /etc/passwd) appeared in the response.';
    case 'subdomain':
      return 'The scanner attempted DNS resolution for a set of common subdomain prefixes (e.g. api, dev, staging) to identify hosts that may be unintentionally exposed.';
    case 'cookies':
      return 'The scanner inspected the Set-Cookie headers returned by the server and checked whether the HttpOnly, Secure, and SameSite flags were set on session-related cookies.';
    case 'error':
      return 'The scanner sent a request with unexpected input and checked whether the application returned a 500-level status code, a stack trace, or other verbose error detail in the response body.';
    case 'access_control':
      return 'The scanner found a numeric ID at the end of a URL path, incremented it by one, and compared both responses — different 200 responses suggest the application is not enforcing per-user access control.';
    case 'rate_limit':
      return 'The scanner sent a short burst of requests to the same URL and checked for HTTP 429 responses, Retry-After headers, or "too many requests" text — the standard signals of an active rate limiter.';
    case 'policy':
      return 'The scanner checked whether the target hostname is permitted under the current worker scan policy.';
    case 'network':
      return 'The scanner attempted DNS resolution for the hostname and recorded any failure.';
    case 'http':
      return 'The scanner sent a basic HTTP request and recorded any connection, redirect, or protocol-level error.';
    default:
      return 'This issue was identified by running automated checks against the target URL.';
  }
}

function mitigationAdvice(vuln = {}) {
  const category = vuln.category || '';
  switch (category) {
    case 'xss':
      return 'Encode/escape all untrusted data before rendering it in HTML. Use your framework\'s templating engine rather than raw string concatenation. Validate and reject unexpected input server-side. Add a strict Content-Security-Policy header as a secondary defence.';
    case 'sqli':
      return 'Use parameterised queries or a well-tested ORM for every database call. Never concatenate user input into SQL strings. Apply server-side input validation as a secondary control.';
    case 'headers':
      return 'Add the missing header at your reverse proxy, web server, or CDN (Nginx, Apache, Cloudflare, or a library such as Helmet for Node.js). Each header typically requires one line of configuration.';
    case 'ssl':
      // TLS 1.3 is the recommended standard (RFC 8446). TLS 1.2 is acceptable as a fallback.
      // TLS 1.0 and 1.1 were formally deprecated by RFC 8996 (2021) and must be disabled.
      return 'Configure your server to negotiate TLS 1.3 (recommended) or TLS 1.2 (acceptable fallback) only. Explicitly disable TLS 1.0 and TLS 1.1 at the load balancer or web server. Use strong, modern cipher suites and ensure the certificate is valid, not self-signed, and issued for the correct hostname.';
    case 'traversal':
      return 'Never map user-supplied input directly to filesystem paths. Normalise any resolved path and verify it still falls within your intended base directory before opening a file. Prefer mapping user input to an allow-list of known-safe identifiers.';
    case 'subdomain':
      return 'Audit the discovered subdomain: remove it if unused, or ensure it is properly secured (authentication, up-to-date software, security headers). Maintain an inventory of all public-facing hosts.';
    case 'cookies':
      return 'Set all session and authentication cookies with HttpOnly (prevents script access), Secure (HTTPS only), and an appropriate SameSite policy (Lax or Strict). Do not store sensitive data in cookies accessible to JavaScript.';
    case 'error':
      return 'Disable verbose error messages and stack traces in production. Show users a generic error page and log full details server-side only. Ensure framework debug modes are turned off.';
    case 'access_control':
      return 'Enforce an authorisation check server-side for every object/resource access. Verify that the requesting user owns or has permission to access the specific record before returning or modifying it — never trust IDs from the client alone.';
    case 'rate_limit':
      return 'Apply rate limiting or throttling to sensitive endpoints (login, password reset, registration). Return HTTP 429 with a Retry-After header when the limit is exceeded. Consider account lockout or CAPTCHA for repeated failures.';
    case 'policy':
      return 'Review the worker scan policy and update the configuration or firewall rules to explicitly allow or deny the target hostname as appropriate.';
    case 'network':
      return 'Confirm the DNS records for this hostname are correct and that the host is reachable from the environment where the scanner runs.';
    case 'http':
      return 'Check network connectivity, proxy settings, and TLS configuration between the scanner and the target. Review any reverse proxy or WAF rules that might be blocking the scanner.';
    default:
      return 'Review the evidence, confirm the finding is real in your environment, and apply an appropriate code or configuration change to remove the root cause.';
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

  let host = 'site';
  try { host = new URL(scan.targetUrl).hostname || 'site'; } catch {}

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true, bufferPages: true });
  const ws = fs.createWriteStream(filePath);
  doc.pipe(ws);

  /* ── Palette ─────────────────────────────────────────────── */
  const C = {
    bg:       '#ffffff',
    ink:      '#111827',
    muted:    '#6b7280',
    subtle:   '#9ca3af',
    border:   '#e5e7eb',
    surface:  '#f9fafb',
    header:   '#0b1220',
    blue:     '#2563eb',
    teal:     '#0d9488',
    critical: '#9333ea',
    high:     '#ef4444',
    medium:   '#f59e0b',
    low:      '#10b981',
    info:     '#94a3b8',
  };

  const sevColor   = (s) => ({ critical: C.critical, high: C.high, medium: C.medium, low: C.low, info: C.info }[s] || C.info);
  const sevBg      = (s) => ({ critical: '#f3e8ff', high: '#fef2f2', medium: '#fffbeb', low: '#ecfdf5', info: '#f1f5f9' }[s] || '#f1f5f9');

  const results = scan.results || [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  results.forEach(v => { const s = (v.severity || 'info').toLowerCase(); if (counts[s] !== undefined) counts[s]++; });
  const total = results.length;
  const highestSev = ['critical','high','medium','low','info'].find(s => counts[s] > 0) || 'info';

  /* ── Helpers ─────────────────────────────────────────────── */
  function footer() {
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);

      // ── Dark navy header bar stamped on every page
      doc.save().rect(0, 0, PAGE_W, 56).fill('#0F172A').restore();
      doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(18)
        .text('LUMEN', MARGIN, 16, { lineBreak: false });
      doc.fillColor('#38BDF8').font('Helvetica').fontSize(10)
        .text('  Security Scan Report', MARGIN + 62, 21, { lineBreak: false });
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(8)
        .text(host, MARGIN, 36, { width: CONTENT_W, align: 'right', lineBreak: false });
      doc.fillColor('#64748B').font('Helvetica').fontSize(8)
        .text(formatDateTime(new Date()), MARGIN, 46, { width: CONTENT_W, align: 'right', lineBreak: false });
      // Thin divider under header
      doc.save().moveTo(MARGIN, 62).lineTo(PAGE_W - MARGIN, 62)
        .strokeColor('#1E293B').lineWidth(0.5).stroke().restore();

      // ── Dark navy footer bar
      doc.save().rect(0, PAGE_H - 28, PAGE_W, 28).fill('#0F172A').restore();
      doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
        .text('CONFIDENTIAL — For authorised recipients only', MARGIN, PAGE_H - 18, { lineBreak: false });
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
        .text(`Page ${i + 1} of ${total}`, MARGIN, PAGE_H - 18,
          { width: CONTENT_W, align: 'right', lineBreak: false });
    }
  }

  function sectionHeader(label) {
    doc.moveDown(0.8);
    // Band
    doc.save()
      .rect(MARGIN, doc.y, CONTENT_W, 22).fill('#f3f4f6')
      .restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink)
      .text(label.toUpperCase(), MARGIN + 8, doc.y + 6, { characterSpacing: 0.8 });
    doc.y += 26;
    doc.moveDown(0.4);
  }

  function pill(label, color, bgColor, x, y, w = 70, h = 16) {
    doc.save()
      .roundedRect(x, y, w, h, h / 2).fill(bgColor)
      .restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(color)
      .text(label, x, y + 4, { width: w, align: 'center', lineBreak: false });
  }

  function countChip(label, count, color, x, y) {
    const W = 90, H = 42;
    doc.save().roundedRect(x, y, W, H, 6).fill('#f9fafb').restore();
    doc.save().rect(x, y, 3, H).fill(color).restore();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(color)
      .text(String(count), x + 12, y + 6, { width: W - 16, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text(label, x + 12, y + 26, { width: W - 16, lineBreak: false });
  }

  function metaRow(label, value, x, y, w) {
    const LABEL_W = 80;
    const VALUE_W = Math.max(w - LABEL_W - 8, 40);
    // Label — never wraps
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted)
      .text(label, x, y, { width: LABEL_W, lineBreak: false });
    // Value — wraps within its column and does NOT advance doc.y
    doc.font('Helvetica').fontSize(9).fillColor(C.ink)
      .text(String(value ?? '—'), x + LABEL_W + 8, y, { width: VALUE_W, lineBreak: true });
  }

  // The header is now stamped on every page inside footer() after doc.end().
  // Skip past the header area so page-1 content starts below it.
  doc.y = 72;

  /* ── Executive Summary ───────────────────────────────────── */
  sectionHeader('Executive Summary');

  const summaryText = total
    ? `This report summarises automated security checks against ${host}. The highest observed severity is ${highestSev.toUpperCase()} across ${total} finding${total !== 1 ? 's' : ''}. Priority items relate to configuration hardening and input validation.`
    : `Automated security checks were run against ${host}. No findings were recorded by the active scan profile.`;

  doc.font('Helvetica').fontSize(10).fillColor(C.muted).text(summaryText, { width: CONTENT_W });
  doc.moveDown(0.8);

  // Severity count chips
  const chipOrder = ['critical','high','medium','low','info'];
  const chipW = 96;
  const startX = MARGIN;
  chipOrder.forEach((s, i) => countChip(s.charAt(0).toUpperCase() + s.slice(1), counts[s], sevColor(s), startX + i * (chipW + 6), doc.y));
  doc.y += 52;

  /* ── Scan Metadata ───────────────────────────────────────── */
  sectionHeader('Scan Details');

  const metaY = doc.y;
  const META_H = 88;
  doc.save().roundedRect(MARGIN, metaY, CONTENT_W, META_H, 6).fill(C.surface).restore();
  doc.save().rect(MARGIN, metaY, 3, META_H).fill(C.blue).restore();

  // Two-column layout — each column owns exactly half the content width
  const HALF = Math.floor(CONTENT_W / 2) - 6;
  const col1 = MARGIN + 12;
  const col2 = MARGIN + 12 + HALF + 6;

  // Row 1 — Target URL (full width, may wrap)
  metaRow('Target URL', scan.targetUrl || '—', col1, metaY + 10, CONTENT_W - 16);

  // Row 2 — Status (left) / Started (right)
  metaRow('Status',  scan.status || '—',              col1, metaY + 34, HALF);
  metaRow('Started', formatDateTime(scan.startedAt),  col2, metaY + 34, HALF);

  // Row 3 — Modules (left) / Completed (right)
  const profileList = Array.isArray(scan.scanProfile) ? scan.scanProfile.join(', ') : '—';
  metaRow('Modules',   profileList,                       col1, metaY + 58, HALF);
  metaRow('Completed', formatDateTime(scan.completedAt), col2, metaY + 58, HALF);

  doc.y = metaY + META_H + 8;

  /* ── Scope & Methodology ─────────────────────────────────── */
  sectionHeader('Scope and Methodology');

  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text('The scanner executed lightweight automated checks against the public HTTP interface:');
  doc.moveDown(0.3);

  const bullets = [
    'TLS/HTTPS — certificate validity and protocol version',
    'HTTP security headers — presence and configuration',
    'Reflected XSS — script injection via query parameters',
    'SQL injection — error-based detection via query parameters',
    'Directory traversal — sensitive path probing',
    'Subdomain discovery — common prefix DNS lookups',
    'Cookie security — HttpOnly, Secure and SameSite flags',
    'Error disclosure — stack traces and verbose error messages',
    'Access control (IDOR) — numeric ID substitution probes',
    'Rate limiting — repeated request burst detection',
  ];

  bullets.forEach(b => {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
      .text(`\u2022  ${b}`, { indent: 8 });
  });

  /* ── Detailed Findings ───────────────────────────────────── */
  sectionHeader('Detailed Findings');

  if (total === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.muted).text('No findings were recorded for this scan.');
  }

  results.forEach((v, idx) => {
    const sev       = (v.severity || 'info').toLowerCase();
    const color     = sevColor(sev);
    const bg        = sevBg(sev);
    const title     = displayFindingTitle(v);
    const techTitle = String(v.title || '');
    const detection = describeDetection(v);
    const fix       = mitigationAdvice(v);
    const headerHint = getHeaderHintForTitle(v.title);

    // Estimate height needed — if not enough space add a page
    const approxH = 130 + (v.description ? 30 : 0) + (v.evidence ? 30 : 0) + (headerHint ? 20 : 0);
    if (doc.y + approxH > PAGE_H - 80) doc.addPage();

    const cardY = doc.y;
    const cardStartEstimate = 120;

    // Card border
    doc.save().roundedRect(MARGIN, cardY, CONTENT_W, cardStartEstimate, 6).stroke(C.border).restore();
    // Colored left strip
    doc.save().roundedRect(MARGIN, cardY, 4, cardStartEstimate, 3).fill(color).restore();

    // Number badge
    doc.save().circle(MARGIN + 20, cardY + 16, 9).fill(color).restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff')
      .text(String(idx + 1), MARGIN + 12, cardY + 12, { width: 16, align: 'center', lineBreak: false });

    // Title
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink)
      .text(title, MARGIN + 36, cardY + 8, { width: CONTENT_W - 120, lineBreak: false });

    // Technical slug if different
    if (techTitle && techTitle !== title) {
      doc.font('Helvetica').fontSize(8).fillColor(C.subtle)
        .text(techTitle, MARGIN + 36, cardY + 22, { width: CONTENT_W - 120, lineBreak: false });
    }

    // Severity pill
    pill(sev.toUpperCase(), color, bg, MARGIN + CONTENT_W - 68, cardY + 8);

    // Category chip
    if (v.category) {
      const catLabel = v.category.replace(/_/g, ' ');
      doc.font('Helvetica').fontSize(8).fillColor(C.muted)
        .text(catLabel, MARGIN + 36, cardY + 36, { lineBreak: false });
    }

    let bodyY = cardY + 52;

    if (v.description) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
        .text(v.description, MARGIN + 12, bodyY, { width: CONTENT_W - 20 });
      bodyY = doc.y + 4;
    }

    if (headerHint?.meaning) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted)
        .text(headerHint.meaning, MARGIN + 12, bodyY, { width: CONTENT_W - 20 });
      bodyY = doc.y + 4;
    }

    if (v.evidence) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text('Evidence', MARGIN + 12, bodyY);
      bodyY = doc.y;
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
        .text(v.evidence, MARGIN + 12, bodyY, { width: CONTENT_W - 20 });
      bodyY = doc.y + 4;
    }

    // Detection + Fix on grey band
    const bandY = doc.y + 4;
    doc.save().rect(MARGIN, bandY, CONTENT_W, 1).fill(C.border).restore();
    doc.y = bandY + 8;

    const halfW = (CONTENT_W - 16) / 2;
    const leftX = MARGIN + 8;
    const rightX = MARGIN + 8 + halfW + 8;

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text('Detection', leftX, doc.y, { continued: false, width: halfW });
    const detY = doc.y;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text('Remediation', rightX, detY - 11, { width: halfW });

    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text(detection, leftX, detY, { width: halfW });
    const detEndY = doc.y;

    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text(fix, rightX, detY, { width: halfW });
    const fixEndY = doc.y;

    doc.y = Math.max(detEndY, fixEndY) + 16;
  });

  /* ── Finalise ────────────────────────────────────────────── */
  doc.end();
  footer(); // stamp page numbers after all pages are known

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
      { id: 'title',       title: 'Title' },
      { id: 'severity',    title: 'Severity' },
      { id: 'category',    title: 'Category' },
      { id: 'description', title: 'Description' },
      { id: 'detection',   title: 'Detection method' },
      { id: 'remediation', title: 'Remediation' },
      { id: 'evidence',    title: 'Evidence' },
      { id: 'cve',         title: 'CVE' },
    ],
  });

  const rows = (scan.results || []).map(v => ({
    title:       displayFindingTitle(v) || String(v.title || ''),
    severity:    v.severity ? v.severity.charAt(0).toUpperCase() + v.severity.slice(1).toLowerCase() : 'Info',
    category:    v.category ? String(v.category).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '',
    description: v.description || '',
    detection:   describeDetection(v),
    remediation: mitigationAdvice(v),
    evidence:    v.evidence || '',
    cve:         v.cve || '',
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
