import express from 'express';
import Joi from 'joi';
import net from 'node:net';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

import Scan from '../models/Scan.js';
import RecurringScan from '../models/RecurringScan.js';
import { scanQueue } from '../queue/index.js';
import { assistantChat } from '../services/assistant.js';
import { displayFindingTitle } from '../services/findingTitle.js';

const router = express.Router();

const BLOCKED_IP_PREFIXES = [
  '0.',
  '10.',
  '127.',
  '169.254.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
];

const isBlockedHost = (host) => {
  if (!host) return true;

  const h = String(host).toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;

  const ipType = net.isIP(h);
  if (ipType === 4) {
    return BLOCKED_IP_PREFIXES.some((p) => h.startsWith(p));
  }

  // Keep IPv6 simple: block localhost; allow public domains.
  if (ipType === 6) {
    if (h === '::1') return true;
  }

  return false;
};

const publicOwnerQuery = { $or: [{ userId: { $exists: false } }, { userId: null }] };

function ensureReportDir() {
  const dirName = process.env.REPORTS_DIR || 'reports';
  const dir = path.join(process.cwd(), dirName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeName(s = '') {
  return String(s).replace(/[^a-z0-9\-_.]/gi, '_');
}

function makeReportName(scan) {
  let host = 'site';
  try {
    host = new URL(scan.targetUrl).hostname || 'site';
  } catch {
    // ignore
  }

  return `${sanitizeName(host)}_${scan._id.toString()}_security_report.pdf`;
}

function severityRank(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical') return 4;
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
}

async function writePdfReport(scan, filePath) {
  const doc = new PDFDocument({ margin: 40 });
  const ws = fs.createWriteStream(filePath);

  const results = Array.isArray(scan.results) ? scan.results : [];
  const sorted = [...results].sort((a, b) => {
    const d = severityRank(b.severity) - severityRank(a.severity);
    if (d) return d;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });

  doc.pipe(ws);

  doc.font('Helvetica-Bold').fontSize(18).text('Security Scan Report');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  doc.text(`Target: ${scan.targetUrl}`);
  doc.text(`Status: ${scan.status}`);
  if (scan.startedAt) doc.text(`Started: ${new Date(scan.startedAt).toISOString()}`);
  if (scan.completedAt) doc.text(`Completed: ${new Date(scan.completedAt).toISOString()}`);

  doc.moveDown(0.8);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Findings');
  doc.moveDown(0.3);

  if (!sorted.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text('No findings recorded for this scan profile.');
  } else {
    sorted.forEach((v, idx) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#111827')
        .text(`${idx + 1}. [${String(v.severity || 'info').toUpperCase()}] ${displayFindingTitle(v)}`);

      doc.font('Helvetica').fontSize(10).fillColor('#374151');
      if (v.category) doc.text(`Category: ${v.category}`);
      if (v.description) doc.text(v.description);
      if (v.evidence) doc.text(`Evidence: ${v.evidence}`);
      doc.moveDown(0.4);
    });
  }

  doc.end();

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

const startScanSchema = Joi.object({
  target: Joi.string().uri({ allowRelative: false }).required(),
  modules: Joi.array().items(Joi.string()).optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
});

const scheduleSchema = Joi.object({
  target: Joi.string().uri({ allowRelative: false }).required(),
  cron: Joi.string().required(),
  modules: Joi.array().items(Joi.string()).optional(),
  timezone: Joi.string().optional(),
  webhookUrl: Joi.string().uri({ allowRelative: false }).optional(),
  runNow: Joi.boolean().optional().default(false),
});

const messageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant').required(),
  content: Joi.string().min(1).max(2000).required(),
});

const publicChatSchema = Joi.object({
  findingIndex: Joi.number().integer().min(0).required(),
  messages: Joi.array().items(messageSchema).min(1).max(12).required(),
});

const ensureRecurringJob = async (recurring) => {
  const tz = recurring.timezone || undefined;
  const repeat = tz ? { cron: recurring.cron, tz } : { cron: recurring.cron };

  await scanQueue.add(
    'recurringTick',
    { recurringScanId: recurring._id.toString() },
    {
      jobId: `recurring:${recurring._id.toString()}`,
      repeat,
    },
  );
};

// POST /api/publicApi/scans
router.post('/scans', async (req, res, next) => {
  try {
    const data = await startScanSchema.validateAsync(req.body, { stripUnknown: true });

    let host;
    try {
      host = new URL(data.target).hostname?.toLowerCase();
    } catch {
      host = null;
    }

    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === 'true';
    if (!allowPrivate && isBlockedHost(host)) {
      return res.status(400).json({
        error: 'This target is not allowed. For safety, localhost/private network targets are blocked in this deployment.',
      });
    }

    const scan = await Scan.create({
      userId: null,
      targetUrl: data.target,
      targetHost: host || undefined,
      scanProfile: data.modules || [],
      status: 'queued',
      progress: 0,
      scheduled: false,
      webhookUrl: data.webhookUrl || undefined,
      policy: { status: 'unknown' },
    });

    await scanQueue.add(
      'start',
      {
        scanId: scan._id.toString(),
        scanProfile: data.modules || [],
        webhookUrl: data.webhookUrl || undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    res.status(201).json({
      id: scan._id,
      status: scan.status,
      message: 'Scan queued',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/publicApi/scans
router.get('/scans', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const scans = await Scan.find(publicOwnerQuery).sort({ createdAt: -1 }).limit(limit);
    res.json(scans);
  } catch (err) {
    next(err);
  }
});

// GET /api/publicApi/scans/:id
router.get('/scans/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json(scan);
  } catch (err) {
    next(err);
  }
});

// POST /api/publicApi/scans/:id/chat
router.post('/scans/:id/chat', async (req, res, next) => {
  try {
    const { findingIndex, messages } = await publicChatSchema.validateAsync(req.body, { stripUnknown: true });

    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const results = Array.isArray(scan.results) ? scan.results : [];
    const finding = results[findingIndex];
    if (!finding) return res.status(404).json({ error: 'Finding not found' });

    const result = await assistantChat({ scan, finding, messages });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/publicApi/scans/:id/report
router.get('/scans/:id/report', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    res.json({
      id: scan._id,
      target: scan.targetUrl,
      status: scan.status,
      progress: scan.progress,
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      findings: (scan.results || []).map((f) => ({ ...f, displayTitle: displayFindingTitle(f) })),
      reportPdfUrl: `/api/publicApi/scans/${scan._id.toString()}/report.pdf`,
      reportCsvUrl: `/api/publicApi/scans/${scan._id.toString()}/report.csv`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/publicApi/scans/:id/report.pdf
router.get('/scans/:id/report.pdf', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const dir = ensureReportDir();
    const fileName = makeReportName(scan);
    const filePath = path.join(dir, fileName);

    if (!fs.existsSync(filePath)) {
      await writePdfReport(scan, filePath);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

function escapeCsv(value) {
  const raw = String(value ?? '');
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

// GET /api/publicApi/scans/:id/report.csv
router.get('/scans/:id/report.csv', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const host = (() => {
      try {
        return new URL(scan.targetUrl).hostname || 'site';
      } catch {
        return 'site';
      }
    })();

    const fileName = `${sanitizeName(host)}_${scan._id.toString()}_findings.csv`;

    const rows = Array.isArray(scan.results) ? scan.results : [];
    const header = ['Title', 'TechnicalTitle', 'Category', 'Severity', 'CVE', 'Description', 'Evidence'];

    const csv = [
      header.join(','),
      ...rows.map((v) => [
        escapeCsv(displayFindingTitle(v)),
        escapeCsv(v.title || ''),
        escapeCsv(v.category || ''),
        escapeCsv(v.severity || ''),
        escapeCsv(v.cve || ''),
        escapeCsv(v.description || ''),
        escapeCsv(v.evidence || ''),
      ].join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// POST /api/publicApi/schedules
router.post('/schedules', async (req, res, next) => {
  try {
    const data = await scheduleSchema.validateAsync(req.body, { stripUnknown: true });

    let host;
    try {
      host = new URL(data.target).hostname?.toLowerCase();
    } catch {
      host = null;
    }

    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === 'true';
    if (!allowPrivate && isBlockedHost(host)) {
      return res.status(400).json({
        error: 'This target is not allowed. For safety, localhost/private network targets are blocked in this deployment.',
      });
    }

    const schedule = await RecurringScan.create({
      userId: null,
      targetUrl: data.target,
      targetHost: host || undefined,
      scanProfile: data.modules || [],
      cron: data.cron,
      timezone: data.timezone || undefined,
      enabled: true,
      webhookUrl: data.webhookUrl || undefined,
    });

    try {
      await ensureRecurringJob(schedule);
    } catch (e) {
      await schedule.deleteOne();
      return res.status(400).json({ error: `Invalid schedule: ${e.message}` });
    }

    if (data.runNow) {
      const scan = await Scan.create({
        userId: null,
        targetUrl: data.target,
        targetHost: host || undefined,
        scanProfile: data.modules || [],
        status: 'queued',
        progress: 0,
        scheduled: true,
        scheduledFor: new Date(),
        webhookUrl: data.webhookUrl || undefined,
        policy: { status: 'unknown' },
        recurringScanId: schedule._id,
      });

      await scanQueue.add(
        'start',
        {
          scanId: scan._id.toString(),
          scanProfile: data.modules || [],
          webhookUrl: data.webhookUrl || undefined,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );

      return res.status(201).json({
        id: schedule._id,
        target: schedule.targetUrl,
        cron: schedule.cron,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        startedScanId: scan._id,
      });
    }

    res.status(201).json({
      id: schedule._id,
      target: schedule.targetUrl,
      cron: schedule.cron,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/publicApi/schedules
router.get('/schedules', async (req, res, next) => {
  try {
    const items = await RecurringScan.find(publicOwnerQuery).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/publicApi/schedules/:id
router.delete('/schedules/:id', async (req, res, next) => {
  try {
    const schedule = await RecurringScan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const jobId = `recurring:${schedule._id.toString()}`;
    const jobs = await scanQueue.getRepeatableJobs();

    await Promise.all(
      jobs
        .filter((j) => j.id === jobId || String(j.key || '').includes(jobId))
        .map((j) => scanQueue.removeRepeatableByKey(j.key)),
    );

    await schedule.deleteOne();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
