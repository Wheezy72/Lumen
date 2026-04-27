/**
 * utils/pdfReport.js
 *
 * The one place that knows how to render a Lumen security report as a PDF.
 * Both the public API download endpoint (/api/publicApi/scans/:id/report.pdf)
 * and the email service import from here so the output is always identical.
 *
 * Design mirrors the React dashboard: dark navy header/footer, summary
 * dashboard with severity counts, coloured severity badges per finding,
 * and indented grey evidence blocks.
 */

import fs   from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ensureReportDir }   from './reportDir.js';
import { getSeverityRank }   from './severity.js';
import { displayFindingTitle } from '../services/findingTitle.js';

// ---------------------------------------------------------------------------
// Filename helpers — shared naming convention used by both API endpoints
// ---------------------------------------------------------------------------

function sanitize(s = '') {
  // Keep only URL-safe characters so filenames work on every OS.
  return String(s).replace(/[^a-z0-9\-_.]/gi, '_');
}

function scanDate(scan) {
  // Prefer completedAt so the date reflects when the scan actually finished.
  return new Date(scan.completedAt || scan.startedAt || Date.now())
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
}

function getHost(scan) {
  try { return new URL(scan.targetUrl).hostname || 'site'; }
  catch { return 'site'; }
}

/**
 * Canonical PDF filename.
 * Example: Lumen_ScanReport_dvwa.local_2026-04-26.pdf
 */
export function makePdfFileName(scan) {
  return `Lumen_ScanReport_${sanitize(getHost(scan))}_${scanDate(scan)}.pdf`;
}

/**
 * Canonical CSV filename.
 * Example: Lumen_Findings_dvwa.local_2026-04-26.csv
 */
export function makeCsvFileName(scan) {
  return `Lumen_Findings_${sanitize(getHost(scan))}_${scanDate(scan)}.csv`;
}

// ---------------------------------------------------------------------------
// Severity palette
// ---------------------------------------------------------------------------

// Each severity level gets a background colour for its badge and a label.
const SEV_STYLES = {
  critical: { bg: '#7F1D1D', text: '#FFFFFF', label: 'CRITICAL' },
  high:     { bg: '#991B1B', text: '#FFFFFF', label: 'HIGH'     },
  medium:   { bg: '#92400E', text: '#FFFFFF', label: 'MEDIUM'   },
  low:      { bg: '#1E3A8A', text: '#FFFFFF', label: 'LOW'      },
  info:     { bg: '#374151', text: '#FFFFFF', label: 'INFO'     },
};

function sevStyle(sev) {
  return SEV_STYLES[String(sev || 'info').toLowerCase()] || SEV_STYLES.info;
}

// ---------------------------------------------------------------------------
// Page geometry — A4 in points
// ---------------------------------------------------------------------------

const PAGE_W  = 595.28; // A4 width  in pt
const PAGE_H  = 841.89; // A4 height in pt
const MARGIN  = 48;
const INNER_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Draws a filled rounded-rect badge with the severity label inside.
 * Returns the badge width so callers can position things beside it.
 */
function drawBadge(doc, x, y, sev) {
  const s = sevStyle(sev);
  const PAD_H = 8, PAD_V = 3, FS = 8;

  doc.font('Helvetica-Bold').fontSize(FS);
  const bw = doc.widthOfString(s.label) + PAD_H * 2;
  const bh = FS + PAD_V * 2;

  // Coloured background rectangle
  doc.save().roundedRect(x, y, bw, bh, 3).fill(s.bg).restore();
  // White label on top
  doc.fillColor(s.text).font('Helvetica-Bold').fontSize(FS)
    .text(s.label, x + PAD_H, y + PAD_V, { lineBreak: false });

  return bw;
}

/**
 * Runs after doc.end() to stamp the header and footer onto every page.
 * PDFKit buffers pages in memory, so we can go back and write on them
 * after the content is finalised.
 */
function stampHeaderFooter(doc, scan) {
  const host    = getHost(scan);
  const range   = doc.bufferedPageRange();
  const total   = range.count;
  const genDate = new Date(scan.completedAt || scan.startedAt || Date.now())
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);

    // ── Header bar (dark navy strip across the top)
    doc.save().rect(0, 0, PAGE_W, 56).fill('#0F172A').restore();

    doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(18)
      .text('LUMEN', MARGIN, 16, { lineBreak: false });
    doc.fillColor('#38BDF8').font('Helvetica').fontSize(10)
      .text('  Security Scan Report', MARGIN + 62, 21, { lineBreak: false });

    // Target hostname right-aligned in the header
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(8)
      .text(host, MARGIN, 36, { width: INNER_W, align: 'right', lineBreak: false });
    doc.fillColor('#64748B').font('Helvetica').fontSize(8)
      .text(genDate, MARGIN, 46, { width: INNER_W, align: 'right', lineBreak: false });

    // Thin divider line under the header
    doc.save().moveTo(MARGIN, 62).lineTo(PAGE_W - MARGIN, 62)
      .strokeColor('#1E293B').lineWidth(0.5).stroke().restore();

    // ── Footer bar (dark navy strip across the bottom)
    doc.save().rect(0, PAGE_H - 28, PAGE_W, 28).fill('#0F172A').restore();

    doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
      .text('CONFIDENTIAL — For authorised recipients only',
        MARGIN, PAGE_H - 18, { lineBreak: false });
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      .text(`Page ${i + 1} of ${total}`, MARGIN, PAGE_H - 18,
        { width: INNER_W, align: 'right', lineBreak: false });
  }
}

/**
 * Draws the dark summary card at the top of the first page.
 * Shows Critical / High / Medium / Low counts in their respective colours.
 */
function drawSummaryDashboard(doc, results) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  results.forEach(r => {
    const k = String(r.severity || 'info').toLowerCase();
    if (counts[k] !== undefined) counts[k]++;
  });

  const boxH = 76;
  const boxY = doc.y;

  // Dark card background
  doc.save().roundedRect(MARGIN, boxY, INNER_W, boxH, 6).fill('#0F172A').restore();

  doc.fillColor('#94A3B8').font('Helvetica-Bold').fontSize(7)
    .text('VULNERABILITY SUMMARY', MARGIN + 14, boxY + 10, { lineBreak: false });

  const cols = [
    { key: 'critical', color: '#EF4444', label: 'Critical' },
    { key: 'high',     color: '#F97316', label: 'High'     },
    { key: 'medium',   color: '#EAB308', label: 'Medium'   },
    { key: 'low',      color: '#3B82F6', label: 'Low'      },
  ];

  const colW = INNER_W / cols.length;
  cols.forEach((col, i) => {
    const cx = MARGIN + i * colW + colW / 2;
    // Large count number
    doc.fillColor(col.color).font('Helvetica-Bold').fontSize(22)
      .text(String(counts[col.key]), cx - 32, boxY + 22,
        { width: 64, align: 'center', lineBreak: false });
    // Small label underneath
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(8)
      .text(col.label, cx - 32, boxY + 52,
        { width: 64, align: 'center', lineBreak: false });
  });

  // Move the cursor past the card so content starts below it
  doc.y = boxY + boxH + 14;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generates a full enterprise PDF for the given scan and writes it to filePath.
 *
 * Typical usage:
 *   const filePath = path.join(ensureReportDir(), makePdfFileName(scan));
 *   await writePdfReport(scan, filePath);
 */
export async function writePdfReport(scan, filePath) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const ws  = fs.createWriteStream(filePath);
  doc.pipe(ws);

  // Sort findings by severity (critical first), then alphabetically by title.
  const results = Array.isArray(scan.results) ? scan.results : [];
  const sorted  = [...results].sort((a, b) => {
    const d = getSeverityRank(b.severity) - getSeverityRank(a.severity);
    return d || String(a.title || '').localeCompare(String(b.title || ''));
  });

  // Content starts at y=72 to sit below the header bar (which is stamped later).
  doc.y = 72;

  // ── Scan metadata block
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text('Target', MARGIN);
  doc.fillColor('#334155').font('Helvetica').fontSize(10)
    .text(scan.targetUrl, MARGIN, doc.y, { width: INNER_W });
  doc.moveDown(0.3);

  // Status shown in its own colour so it pops visually
  const statusColor = { completed: '#16A34A', running: '#2563EB', failed: '#DC2626', queued: '#6B7280' };
  doc.fillColor(statusColor[scan.status] || '#6B7280').font('Helvetica-Bold').fontSize(9)
    .text(`Status: ${String(scan.status || '').toUpperCase()}`, MARGIN);

  if (scan.startedAt) {
    doc.fillColor('#64748B').font('Helvetica').fontSize(9)
      .text(`Started:   ${new Date(scan.startedAt).toISOString()}`, MARGIN);
  }
  if (scan.completedAt) {
    doc.fillColor('#64748B').font('Helvetica').fontSize(9)
      .text(`Completed: ${new Date(scan.completedAt).toISOString()}`, MARGIN);
  }
  doc.moveDown(1.0);

  // ── Summary dashboard card
  drawSummaryDashboard(doc, results);
  doc.moveDown(0.4);

  // ── "Findings (N)" section heading with a horizontal rule under it
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13)
    .text(`Findings  (${sorted.length})`, MARGIN);
  doc.save()
    .moveTo(MARGIN, doc.y).lineTo(MARGIN + INNER_W, doc.y)
    .strokeColor('#E2E8F0').lineWidth(1).stroke()
    .restore();
  doc.moveDown(0.6);

  // ── Individual findings
  if (!sorted.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#64748B')
      .text('No findings recorded for this scan profile.', MARGIN);
  } else {
    sorted.forEach((v, idx) => {
      const sev   = String(v.severity || 'info').toLowerCase();
      const style = sevStyle(sev);

      // If we're close to the bottom, start a new page before drawing.
      if (doc.y > PAGE_H - 120) doc.addPage();

      const cardTop = doc.y;
      const titleX  = MARGIN + 14;   // indented to leave room for the accent strip
      const titleW  = INNER_W - 14 - 92; // leave room for the badge on the right
      const badgeX  = MARGIN + INNER_W - 82;

      // Helper to draw (or redraw) the coloured left accent strip.
      // We draw it twice: once as a placeholder, then again at the actual height.
      const drawAccent = h =>
        doc.save().rect(MARGIN, cardTop, 4, Math.max(h, 14)).fill(style.bg).restore();

      drawAccent(14); // placeholder height

      // Finding title in bold
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11)
        .text(`${idx + 1}. ${displayFindingTitle(v)}`, titleX, cardTop,
          { width: titleW, lineBreak: true });

      const afterTitle = doc.y;
      drawBadge(doc, badgeX, cardTop, sev); // badge in the top-right corner
      doc.y = afterTitle; // restore cursor after badge draw

      drawAccent(doc.y - cardTop + 4); // redraw strip at its true height

      // Category line (if present)
      if (v.category) {
        doc.fillColor('#64748B').font('Helvetica').fontSize(9)
          .text(`Category: ${v.category}`, titleX);
      }
      doc.moveDown(0.25);

      // Description
      if (v.description) {
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9)
          .text('Description', titleX);
        doc.fillColor('#64748B').font('Helvetica').fontSize(9)
          .text(v.description, titleX + 8, doc.y, { width: INNER_W - 22 });
        doc.moveDown(0.2);
      }

      // Evidence — rendered inside a light grey pill so it stands out from
      // the body text and doesn't get lost in long descriptions.
      if (v.evidence) {
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9)
          .text('Evidence', titleX);

        const evTop  = doc.y;
        const evText = String(v.evidence);
        // Estimate the block height; PDFKit will wrap the text anyway.
        const evH = Math.max(18, 12 + Math.ceil(evText.length / 88) * 11);

        doc.save().roundedRect(titleX + 8, evTop - 1, INNER_W - 22, evH, 3)
          .fill('#F1F5F9').restore();
        doc.fillColor('#334155').font('Helvetica').fontSize(8.5)
          .text(evText, titleX + 12, evTop + 2, { width: INNER_W - 28 });
        doc.moveDown(0.2);
      }

      // Thin divider between findings
      doc.moveDown(0.5);
      doc.save()
        .moveTo(titleX, doc.y).lineTo(MARGIN + INNER_W, doc.y)
        .strokeColor('#F1F5F9').lineWidth(0.5).stroke()
        .restore();
      doc.moveDown(0.55);
    });
  }

  // Finalise the document, then go back and stamp headers/footers on every page.
  doc.end();
  stampHeaderFooter(doc, scan);

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
    doc.on('error', reject);
  });
}

/**
 * Convenience wrapper: generates the PDF into the shared reports directory
 * and returns { fileName, filePath } for use as an email attachment.
 */
export async function generatePdfForScan(scan) {
  const dir      = ensureReportDir();
  const fileName = makePdfFileName(scan);
  const filePath = path.join(dir, fileName);
  await writePdfReport(scan, filePath);
  return { fileName, filePath };
}
