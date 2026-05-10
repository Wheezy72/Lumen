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
  const fileName = makePdfFileName(scan);
  const filePath = path.join(reportDir, fileName);

  await writePdfReport(scan, filePath);

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
