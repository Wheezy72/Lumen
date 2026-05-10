import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ensureReportDir } from './reportDir.js';
import { getSeverityRank } from './severity.js';
import { displayFindingTitle } from '../services/findingTitle.js';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const INNER_W = PAGE_W - MARGIN * 2;
const HEADER_H = 66;
const FOOTER_H = 34;

const COLORS = {
  ink: '#111827',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  header: '#0F172A',
  accent: '#38BDF8',
  critical: '#7C3AED',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#14B8A6',
  info: '#64748B',
};

const SEV_STYLES = {
  critical: { color: COLORS.critical, bg: '#F3E8FF', label: 'CRITICAL' },
  high: { color: COLORS.high, bg: '#FEF2F2', label: 'HIGH' },
  medium: { color: COLORS.medium, bg: '#FFFBEB', label: 'MEDIUM' },
  low: { color: COLORS.low, bg: '#ECFDF5', label: 'LOW' },
  info: { color: COLORS.info, bg: '#F1F5F9', label: 'INFO' },
};

function sanitize(s = '') {
  return String(s).replace(/[^a-z0-9\-_.]/gi, '_');
}

function scanDate(scan) {
  return new Date(scan.completedAt || scan.startedAt || Date.now()).toISOString().slice(0, 10);
}

function getHost(scan) {
  try { return new URL(scan.targetUrl).hostname || 'site'; }
  catch { return 'site'; }
}

export function makePdfFileName(scan) {
  return `Lumen_ScanReport_${sanitize(getHost(scan))}_${scanDate(scan)}.pdf`;
}

export function makeCsvFileName(scan) {
  return `Lumen_Findings_${sanitize(getHost(scan))}_${scanDate(scan)}.csv`;
}

function severityStyle(severity) {
  return SEV_STYLES[String(severity || 'info').toLowerCase()] || SEV_STYLES.info;
}

function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function logoPath() {
  const candidates = [
    path.resolve(process.cwd(), 'frontend/public/logo.jpg'),
    path.resolve(process.cwd(), '../frontend/public/logo.jpg'),
    path.resolve(process.cwd(), 'public/logo.jpg'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function realFindings(results) {
  return results.filter((finding) => String(finding.category || '').toLowerCase() !== 'coverage');
}

function coverageFinding(results) {
  return results.find((finding) => String(finding.category || '').toLowerCase() === 'coverage');
}

function countSeverities(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((finding) => {
    const severity = String(finding.severity || 'info').toLowerCase();
    if (counts[severity] !== undefined) counts[severity] += 1;
  });
  return counts;
}

function highestSeverity(counts) {
  return ['critical', 'high', 'medium', 'low', 'info'].find((severity) => counts[severity] > 0) || 'info';
}

function addPageIfNeeded(doc, needed = 120) {
  if (doc.y + needed > PAGE_H - FOOTER_H - 28) {
    doc.addPage();
    doc.y = HEADER_H + 20;
  }
}

function drawLogoOrWordmark(doc, x, y) {
  const logo = logoPath();
  if (logo) {
    try {
      doc.image(logo, x, y, { width: 34, height: 34, fit: [34, 34] });
      return x + 42;
    } catch {
      // Fall through to wordmark if the image cannot be decoded.
    }
  }

  doc.save().roundedRect(x, y, 34, 34, 8).fill('#1E293B').restore();
  doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(15)
    .text('L', x, y + 8, { width: 34, align: 'center', lineBreak: false });
  return x + 42;
}

function stampHeaderFooter(doc, scan) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const host = getHost(scan);
  const generated = formatDate(new Date());

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);

    doc.save().rect(0, 0, PAGE_W, HEADER_H).fill(COLORS.header).restore();
    const textX = drawLogoOrWordmark(doc, MARGIN, 16);

    doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(16)
      .text('Lumen', textX, 17, { lineBreak: false });
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(9)
      .text('Security scan report', textX, 38, { lineBreak: false });

    doc.fillColor('#CBD5E1').font('Helvetica-Bold').fontSize(8)
      .text(host, MARGIN, 20, { width: INNER_W, align: 'right', lineBreak: false });
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5)
      .text(`Generated ${generated}`, MARGIN, 34, { width: INNER_W, align: 'right', lineBreak: false });

    doc.save().moveTo(MARGIN, HEADER_H + 6).lineTo(PAGE_W - MARGIN, HEADER_H + 6)
      .strokeColor('#E2E8F0').lineWidth(0.6).stroke().restore();

    doc.save().rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H).fill('#F8FAFC').restore();
    doc.save().moveTo(MARGIN, PAGE_H - FOOTER_H).lineTo(PAGE_W - MARGIN, PAGE_H - FOOTER_H)
      .strokeColor('#E2E8F0').lineWidth(0.6).stroke().restore();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text('Lumen Vulnerability Scanner — confidential, authorised use only',
        MARGIN, PAGE_H - 21, { lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(`Page ${i + 1} of ${total}`, MARGIN, PAGE_H - 21, { width: INNER_W, align: 'right', lineBreak: false });
  }
}

function sectionTitle(doc, label) {
  addPageIfNeeded(doc, 44);
  doc.moveDown(0.6);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text(label, MARGIN);
  doc.save().moveTo(MARGIN, doc.y + 3).lineTo(PAGE_W - MARGIN, doc.y + 3)
    .strokeColor(COLORS.border).lineWidth(0.8).stroke().restore();
  doc.moveDown(0.8);
}

function drawSeverityBadge(doc, severity, x, y) {
  const style = severityStyle(severity);
  const label = style.label;
  const width = doc.widthOfString(label) + 16;
  doc.save().roundedRect(x, y, width, 17, 8).fill(style.bg).restore();
  doc.fillColor(style.color).font('Helvetica-Bold').fontSize(7.5)
    .text(label, x, y + 5, { width, align: 'center', lineBreak: false });
  return width;
}

function drawMetricCard(doc, label, value, color, x, y, width) {
  doc.save().roundedRect(x, y, width, 54, 8).fill(COLORS.surface).restore();
  doc.save().roundedRect(x, y, 4, 54, 2).fill(color).restore();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(19)
    .text(String(value), x + 13, y + 10, { width: width - 20, lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    .text(label, x + 13, y + 34, { width: width - 20, lineBreak: false });
}

function drawKeyValue(doc, label, value, x, y, width) {
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8)
    .text(label, x, y, { width, lineBreak: false });
  doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5)
    .text(String(value || '—'), x, y + 12, { width, lineBreak: true });
}

function detectionText(finding = {}) {
  const category = String(finding.category || '').toLowerCase();
  const map = {
    xss: 'Mutated discovered inputs and checked whether the payload was reflected in the response.',
    sqli: 'Mutated discovered inputs with SQL-shaped probes and looked for database error markers.',
    traversal: 'Mutated file/path-like inputs with traversal payloads and checked for file-content markers.',
    command_injection: 'Mutated command-like inputs with harmless echo markers and checked for command output.',
    csrf: 'Inspected state-changing POST templates for obvious anti-CSRF token fields.',
    exposure: 'Requested high-signal sensitive files such as environment files, Git metadata and backups.',
    cors: 'Sent a controlled Origin header and inspected CORS response headers.',
    redirect: 'Mutated redirect-like fields and checked for external Location redirects.',
    headers: 'Checked the response for recommended browser security headers.',
    cookies: 'Inspected Set-Cookie flags for HttpOnly, Secure and SameSite coverage.',
    tls: 'Opened a TLS connection and inspected certificate/protocol information.',
    subdomain: 'Resolved a small set of common subdomain prefixes.',
    error: 'Sent unexpected input and checked for verbose errors or stack traces.',
    access_control: 'Probed predictable numeric object IDs and compared responses.',
    rate_limit: 'Sent a short request burst and checked for rate-limiting signals.',
    coverage: 'Summarised crawler and template discovery coverage.',
  };
  return map[category] || 'Ran an automated check against the discovered target surface.';
}

function remediationText(finding = {}) {
  const category = String(finding.category || '').toLowerCase();
  const map = {
    xss: 'Escape output by context, validate input server-side and deploy a restrictive Content-Security-Policy.',
    sqli: 'Use parameterised queries or a safe ORM. Never concatenate user input into SQL strings.',
    traversal: 'Do not map user input directly to filesystem paths. Use allow-lists and enforce base-directory checks.',
    command_injection: 'Avoid shell execution with user input. Use safe APIs, fixed command arguments and strict allow-lists.',
    csrf: 'Add unpredictable per-session CSRF tokens or require same-origin custom headers for state-changing requests.',
    exposure: 'Remove sensitive files from the web root and block access to backups, debug pages and repository metadata.',
    cors: 'Allow only trusted origins and avoid credentialed responses to arbitrary origins.',
    redirect: 'Redirect only to allow-listed relative paths or trusted domains.',
    headers: 'Set missing headers at the reverse proxy, CDN or application framework layer.',
    cookies: 'Set session cookies with HttpOnly, Secure and an appropriate SameSite policy.',
    tls: 'Use valid certificates and allow only TLS 1.2+ with modern cipher suites.',
    subdomain: 'Review discovered hosts, remove stale DNS and secure services that must remain public.',
    error: 'Disable debug mode and show generic errors while logging details server-side.',
    access_control: 'Enforce server-side authorization for every object access and mutation.',
    rate_limit: 'Apply throttling to login, registration, password reset and other sensitive endpoints.',
    coverage: 'Use this to confirm the scan reached the expected authenticated pages, forms and APIs.',
  };
  return map[category] || 'Review the evidence, verify the finding and fix the root cause.';
}

function drawExecutiveSummary(doc, scan, findings, counts) {
  const status = String(scan.status || 'unknown').toUpperCase();
  const highest = highestSeverity(counts);

  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(19)
    .text('Executive summary', MARGIN, doc.y);
  doc.moveDown(0.3);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10)
    .text(
      findings.length
        ? `Lumen found ${findings.length} issue${findings.length === 1 ? '' : 's'} on ${getHost(scan)}. The highest severity observed is ${highest.toUpperCase()}.`
        : `Lumen completed the selected checks against ${getHost(scan)} and recorded no vulnerability findings.`,
      MARGIN,
      doc.y,
      { width: INNER_W },
    );

  doc.moveDown(0.9);
  const cardW = (INNER_W - 32) / 5;
  ['critical', 'high', 'medium', 'low', 'info'].forEach((severity, index) => {
    const style = severityStyle(severity);
    drawMetricCard(
      doc,
      severity.charAt(0).toUpperCase() + severity.slice(1),
      counts[severity],
      style.color,
      MARGIN + index * (cardW + 8),
      doc.y,
      cardW,
    );
  });
  doc.y += 70;

  const metaY = doc.y;
  doc.save().roundedRect(MARGIN, metaY, INNER_W, 78, 8).fill(COLORS.surface).restore();
  drawKeyValue(doc, 'Target', scan.targetUrl, MARGIN + 14, metaY + 12, INNER_W - 28);
  drawKeyValue(doc, 'Status', status, MARGIN + 14, metaY + 44, 105);
  drawKeyValue(doc, 'Started', formatDate(scan.startedAt), MARGIN + 134, metaY + 44, 145);
  drawKeyValue(doc, 'Completed', formatDate(scan.completedAt), MARGIN + 294, metaY + 44, 145);
  doc.y = metaY + 92;
}

function drawCoverage(doc, coverage) {
  if (!coverage) return;

  sectionTitle(doc, 'Scan coverage');
  doc.save().roundedRect(MARGIN, doc.y, INNER_W, 68, 8).fill(COLORS.surface).restore();
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10)
    .text(coverage.title || 'Scan coverage summary', MARGIN + 14, doc.y + 12, { width: INNER_W - 28 });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
    .text(coverage.description || '', MARGIN + 14, doc.y + 28, { width: INNER_W - 28 });
  if (coverage.evidence) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(coverage.evidence, MARGIN + 14, doc.y + 47, { width: INNER_W - 28 });
  }
  doc.y += 82;
}

function drawFinding(doc, finding, index) {
  addPageIfNeeded(doc, 170);

  const severity = String(finding.severity || 'info').toLowerCase();
  const style = severityStyle(severity);
  const top = doc.y;

  doc.save().roundedRect(MARGIN, top, INNER_W, 1, 1).fill(COLORS.border).restore();
  doc.y += 13;

  doc.save().roundedRect(MARGIN, doc.y, 24, 24, 12).fill(style.color).restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
    .text(String(index + 1), MARGIN, doc.y + 7, { width: 24, align: 'center', lineBreak: false });

  const titleY = doc.y;
  drawSeverityBadge(doc, severity, PAGE_W - MARGIN - 76, titleY + 2);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text(displayFindingTitle(finding), MARGIN + 34, titleY + 2, { width: INNER_W - 128 });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    .text(String(finding.category || 'general').replace(/_/g, ' '), MARGIN + 34, titleY + 19, { width: INNER_W - 128 });

  doc.y = titleY + 42;

  const detailRows = [
    ['Method', finding.method],
    ['URL', finding.url],
    ['Parameter', finding.parameter],
    ['Confidence', finding.confidence],
    ['Fingerprint', finding.fingerprint],
  ].filter(([, value]) => value);

  if (detailRows.length) {
    const rowY = doc.y;
    doc.save().roundedRect(MARGIN + 34, rowY, INNER_W - 34, 15 + detailRows.length * 14, 6).fill(COLORS.surface).restore();
    detailRows.forEach(([label, value], i) => {
      drawKeyValue(doc, label, value, MARGIN + 46, rowY + 8 + i * 14, INNER_W - 58);
    });
    doc.y = rowY + 24 + detailRows.length * 14;
  }

  if (finding.description) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
      .text(finding.description, MARGIN + 34, doc.y, { width: INNER_W - 34 });
    doc.moveDown(0.35);
  }

  if (finding.evidence) {
    addPageIfNeeded(doc, 54);
    const evTop = doc.y + 2;
    const evHeight = Math.max(34, doc.heightOfString(String(finding.evidence), { width: INNER_W - 58 }) + 18);
    doc.save().roundedRect(MARGIN + 34, evTop, INNER_W - 34, evHeight, 6).fill('#F1F5F9').restore();
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8)
      .text('Evidence', MARGIN + 46, evTop + 8, { lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(String(finding.evidence), MARGIN + 46, evTop + 20, { width: INNER_W - 58 });
    doc.y = evTop + evHeight + 10;
  }

  addPageIfNeeded(doc, 72);
  const colW = (INNER_W - 46) / 2;
  const blockY = doc.y;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5)
    .text('How we found it', MARGIN + 34, blockY, { width: colW });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5)
    .text('Recommended fix', MARGIN + 46 + colW, blockY, { width: colW });

  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    .text(detectionText(finding), MARGIN + 34, blockY + 13, { width: colW });
  const leftY = doc.y;
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    .text(remediationText(finding), MARGIN + 46 + colW, blockY + 13, { width: colW });
  doc.y = Math.max(leftY, doc.y) + 18;
}

export async function writePdfReport(scan, filePath) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const ws = fs.createWriteStream(filePath);
  doc.pipe(ws);

  const results = Array.isArray(scan.results) ? scan.results : [];
  const findings = realFindings(results).sort((a, b) => {
    const d = getSeverityRank(b.severity) - getSeverityRank(a.severity);
    return d || String(a.title || '').localeCompare(String(b.title || ''));
  });
  const coverage = coverageFinding(results);
  const counts = countSeverities(findings);

  doc.y = HEADER_H + 22;
  drawExecutiveSummary(doc, scan, findings, counts);
  drawCoverage(doc, coverage);

  sectionTitle(doc, `Findings (${findings.length})`);
  if (!findings.length) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10)
      .text('No vulnerability findings were recorded for this scan profile.', MARGIN, doc.y, { width: INNER_W });
  } else {
    findings.forEach((finding, index) => drawFinding(doc, finding, index));
  }

  stampHeaderFooter(doc, scan);
  doc.end();

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
    doc.on('error', reject);
  });
}

export async function generatePdfForScan(scan) {
  const dir = ensureReportDir();
  const fileName = makePdfFileName(scan);
  const filePath = path.join(dir, fileName);
  await writePdfReport(scan, filePath);
  return { fileName, filePath };
}
