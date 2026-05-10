/**
 * routes/publicApi/index.js
 * Public API router — handles only Express routing.
 * Validation → schemas.js  |  PDF generation → pdfReport.js
 */

import express from 'express';
import net from 'node:net';
import path from 'path';
import fs from 'fs';
import { ensureReportDir } from '../../utils/reportDir.js';
import Scan from '../../models/Scan.js';
import RecurringScan from '../../models/RecurringScan.js';
import { scanQueue } from '../../queue/index.js';
import { assistantChat } from '../../services/assistant.js';
import { displayFindingTitle } from '../../services/findingTitle.js';
import { startScanSchema, scheduleSchema, publicChatSchema } from './schemas.js';
import { writePdfReport, makePdfFileName, makeCsvFileName } from './pdfReport.js';

const router = express.Router();

// ─── Private-network block list ──────────────────────────────────────────────

const BLOCKED_IP_PREFIXES = [
  '0.', '10.', '127.', '169.254.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
];

function isBlockedHost(host) {
  if (!host) return true;
  const h = String(host).toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  const ipType = net.isIP(h);
  if (ipType === 4) return BLOCKED_IP_PREFIXES.some(p => h.startsWith(p));
  if (ipType === 6 && h === '::1') return true;
  return false;
}

// ─── Shared query for public (unauthenticated) scans ────────────────────────

const publicOwnerQuery = { $or: [{ userId: { $exists: false } }, { userId: null }] };

// ─── CSV helper ──────────────────────────────────────────────────────────────

function escapeCsv(value) {
  const raw = String(value ?? '');
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

// ─── Recurring-schedule helper ───────────────────────────────────────────────

async function ensureRecurringJob(recurring) {
  const tz     = recurring.timezone || undefined;
  const repeat = tz ? { cron: recurring.cron, tz } : { cron: recurring.cron };
  await scanQueue.add(
    'recurringTick',
    { recurringScanId: recurring._id.toString() },
    { jobId: `recurring:${recurring._id.toString()}`, repeat },
  );
}

// ─── POST /api/publicApi/scans ───────────────────────────────────────────────

router.post('/scans', async (req, res, next) => {
  try {
    const data = await startScanSchema.validateAsync(req.body, { stripUnknown: true });

    let hostname, targetHost;
    try {
      const parsed = new URL(data.target);
      hostname   = parsed.hostname?.toLowerCase();
      targetHost = parsed.host?.toLowerCase();
    } catch {
      hostname = null;
      targetHost = null;
    }

    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === 'true';
    if (!allowPrivate && isBlockedHost(hostname)) {
      return res.status(400).json({
        error: 'This target is not allowed. For safety, localhost/private network targets are blocked.',
      });
    }

    const scan = await Scan.create({
      userId:     null,
      targetUrl:  data.target,
      targetHost: targetHost || undefined,
      scanProfile: data.modules || [],
      status:     'queued',
      progress:   0,
      scheduled:  false,
      webhookUrl: data.webhookUrl || undefined,
      policy:     { status: 'unknown' },
    });

    await scanQueue.add(
      'start',
      {
        scanId:         scan._id.toString(),
        scanProfile:    data.modules || [],
        webhookUrl:     data.webhookUrl || undefined,
        // Auth cookies/headers forwarded to the Python crawler so it can
        // bypass login screens (e.g. PHPSESSID for DVWA).
        requestHeaders: data.requestHeaders || null,
        sourcePath:     data.sourcePath || null,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    res.status(201).json({ id: scan._id, status: scan.status, message: 'Scan queued' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/scans ────────────────────────────────────────────────

router.get('/scans', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const scans = await Scan.find(publicOwnerQuery).sort({ createdAt: -1 }).limit(limit);
    res.json(scans);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/scans/:id ───────────────────────────────────────────

router.get('/scans/:id', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json(scan);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/publicApi/scans/:id/chat ─────────────────────────────────────

router.post('/scans/:id/chat', async (req, res, next) => {
  try {
    const { findingIndex, messages } = await publicChatSchema.validateAsync(req.body, { stripUnknown: true });
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    const finding = (scan.results || [])[findingIndex];
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    const result = await assistantChat({ scan, finding, messages });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/scans/:id/report (JSON summary) ─────────────────────

router.get('/scans/:id/report', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json({
      id:           scan._id,
      target:       scan.targetUrl,
      status:       scan.status,
      progress:     scan.progress,
      createdAt:    scan.createdAt,
      startedAt:    scan.startedAt,
      completedAt:  scan.completedAt,
      findings:     (scan.results || []).map(f => ({ ...f, displayTitle: displayFindingTitle(f) })),
      reportPdfUrl: `/api/publicApi/scans/${scan._id.toString()}/report.pdf`,
      reportCsvUrl: `/api/publicApi/scans/${scan._id.toString()}/report.csv`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/scans/:id/report.pdf ────────────────────────────────

router.get('/scans/:id/report.pdf', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const dir      = ensureReportDir();
    const fileName = makePdfFileName(scan);
    const filePath = path.join(dir, fileName);

    await writePdfReport(scan, filePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/scans/:id/report.csv ────────────────────────────────

router.get('/scans/:id/report.csv', async (req, res, next) => {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const fileName = makeCsvFileName(scan);
    const header   = ['Title', 'TechnicalTitle', 'Category', 'Severity', 'CVE', 'Description', 'Evidence'];
    const rows     = Array.isArray(scan.results) ? scan.results : [];

    const csv = [
      header.join(','),
      ...rows.map(v => [
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

// ─── POST /api/publicApi/schedules ──────────────────────────────────────────

router.post('/schedules', async (req, res, next) => {
  try {
    const data = await scheduleSchema.validateAsync(req.body, { stripUnknown: true });

    let host;
    try { host = new URL(data.target).hostname?.toLowerCase(); } catch { host = null; }

    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === 'true';
    if (!allowPrivate && isBlockedHost(host)) {
      return res.status(400).json({
        error: 'This target is not allowed. For safety, localhost/private network targets are blocked.',
      });
    }

    const schedule = await RecurringScan.create({
      userId:     null,
      targetUrl:  data.target,
      targetHost: host || undefined,
      scanProfile: data.modules || [],
      cron:       data.cron,
      timezone:   data.timezone || undefined,
      enabled:    true,
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
        userId:          null,
        targetUrl:       data.target,
        targetHost:      host || undefined,
        scanProfile:     data.modules || [],
        status:          'queued',
        progress:        0,
        scheduled:       true,
        scheduledFor:    new Date(),
        webhookUrl:      data.webhookUrl || undefined,
        policy:          { status: 'unknown' },
        recurringScanId: schedule._id,
      });

      await scanQueue.add(
        'start',
        {
          scanId:      scan._id.toString(),
          scanProfile: data.modules || [],
          webhookUrl:  data.webhookUrl || undefined,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      return res.status(201).json({
        id:           schedule._id,
        target:       schedule.targetUrl,
        cron:         schedule.cron,
        timezone:     schedule.timezone,
        enabled:      schedule.enabled,
        startedScanId: scan._id,
      });
    }

    res.status(201).json({
      id:       schedule._id,
      target:   schedule.targetUrl,
      cron:     schedule.cron,
      timezone: schedule.timezone,
      enabled:  schedule.enabled,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/publicApi/schedules ───────────────────────────────────────────

router.get('/schedules', async (req, res, next) => {
  try {
    const items = await RecurringScan.find(publicOwnerQuery).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/publicApi/schedules/:id ────────────────────────────────────

router.delete('/schedules/:id', async (req, res, next) => {
  try {
    const schedule = await RecurringScan.findOne({ _id: req.params.id, ...publicOwnerQuery });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const jobId = `recurring:${schedule._id.toString()}`;
    const jobs  = await scanQueue.getRepeatableJobs();
    await Promise.all(
      jobs
        .filter(j => j.id === jobId || String(j.key || '').includes(jobId))
        .map(j => scanQueue.removeRepeatableByKey(j.key)),
    );

    await schedule.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
