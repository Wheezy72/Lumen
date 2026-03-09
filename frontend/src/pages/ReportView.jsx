import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';

const SEV = {
  critical: { bg: 'bg-purple-500/15 text-purple-400 border border-purple-500/30', dot: 'bg-purple-400' },
  high:     { bg: 'bg-red-500/15 text-red-400 border border-red-500/30',           dot: 'bg-red-400' },
  medium:   { bg: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',     dot: 'bg-amber-400' },
  low:      { bg: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',        dot: 'bg-blue-400' },
  info:     { bg: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',     dot: 'bg-slate-400' },
};

export default function ReportView() {
  const { scanId } = useParams();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const loadScan = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/scans/' + scanId);
      setScan(data);
      setSelectedIndex(0);
    } catch {
      setError('Failed to load scan results');
    } finally {
      setLoading(false);
    }
  };

  const generatePdf = async () => {
    try {
      setPdfLoading(true);
      const { data } = await axios.post('/api/reports/pdf', { scanId });
      window.open(data.url, '_blank');
    } catch { alert('Failed to generate PDF'); }
    finally { setPdfLoading(false); }
  };

  const generateCsv = async () => {
    try {
      setCsvLoading(true);
      const { data } = await axios.post('/api/reports/csv', { scanId });
      window.open(data.url, '_blank');
    } catch { alert('Failed to generate CSV'); }
    finally { setCsvLoading(false); }
  };

  useEffect(() => {
    loadScan();
    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Only re-fetch when this specific scan updates
        if (msg.scanId === scanId && msg.type === 'completed') loadScan();
      } catch {}
    };
    return () => es.close();
  }, [scanId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 mx-auto border-2 border-primary-500 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-500 text-sm">Loading scan results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={loadScan} className="text-primary-500 hover:underline text-sm">Try again</button>
      </div>
    );
  }

  const findings = scan?.results || [];
  const selectedVuln = findings[selectedIndex];

  const sevCounts = findings.reduce((acc, f) => {
    const s = (f.severity || 'info').toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const statusColor = scan?.status === 'completed' ? 'text-emerald-400'
    : scan?.status === 'running' ? 'text-blue-400'
    : scan?.status === 'failed' ? 'text-red-400'
    : 'text-gray-400';

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan Report</h1>
          <p className="text-gray-500 mt-1 break-all text-sm">{scan?.targetUrl}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={generatePdf}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 disabled:opacity-50 transition"
          >
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            onClick={generateCsv}
            disabled={csvLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium btn btn-primary disabled:opacity-50"
          >
            {csvLoading ? 'Generating…' : 'Download CSV'}
          </button>
        </div>
      </div>

      {/* ── Meta bar ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-600 mb-1">Status</p>
            <p className={`font-semibold capitalize ${statusColor}`}>{scan?.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Progress</p>
            <p className="font-semibold text-white">{scan?.progress ?? 0}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Started</p>
            <p className="font-semibold text-white">
              {scan?.startedAt ? new Date(scan.startedAt).toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Completed</p>
            <p className="font-semibold text-white">
              {scan?.completedAt ? new Date(scan.completedAt).toLocaleString() : '—'}
            </p>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap gap-2">
            {['critical','high','medium','low','info'].map((s) =>
              sevCounts[s] ? (
                <span key={s} className={`px-3 py-1 rounded-full text-xs font-medium ${SEV[s]?.bg}`}>
                  {sevCounts[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* ── Findings + Detail ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Findings list */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-4">
          <h2 className="font-semibold text-white mb-3 text-sm">
            Findings <span className="text-gray-600 font-normal">({findings.length})</span>
          </h2>

          {findings.length === 0 ? (
            <div className="py-10 text-center text-gray-600 text-sm">No vulnerabilities found.</div>
          ) : (
            <ul className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {findings.map((f, i) => {
                const sev = (f.severity || 'info').toLowerCase();
                const active = i === selectedIndex;
                return (
                  <li
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`p-3 rounded-lg cursor-pointer transition border ${
                      active
                        ? 'bg-primary-900/30 border-primary-700/50'
                        : 'border-transparent hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-gray-200 font-medium leading-snug">{f.title}</span>
                      <SeverityBadge severity={sev} />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{f.category}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-dark-200 p-5">
          <h2 className="font-semibold text-white mb-4 text-sm">Finding Details</h2>

          {!selectedVuln ? (
            <div className="py-16 text-center text-gray-600 text-sm">Select a finding from the list.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedVuln.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">Category: {selectedVuln.category}</p>
                </div>
                <SeverityBadge severity={(selectedVuln.severity || 'info').toLowerCase()} />
              </div>

              {selectedVuln.description && (
                <div>
                  <h4 className="text-xs font-semibold text-primary-500 uppercase tracking-wide mb-2">Description</h4>
                  <p className="text-gray-300 text-sm leading-relaxed">{selectedVuln.description}</p>
                </div>
              )}

              {selectedVuln.evidence && (
                <div>
                  <h4 className="text-xs font-semibold text-primary-500 uppercase tracking-wide mb-2">Evidence</h4>
                  <div className="rounded-lg bg-black/50 border border-slate-800 p-3 text-xs text-gray-300 font-mono break-all">
                    {selectedVuln.evidence}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-primary-500 uppercase tracking-wide mb-2">How it was detected</h4>
                <p className="text-gray-400 text-sm">{getDetectionMethod(selectedVuln.category)}</p>
              </div>

              <div className="rounded-lg border border-emerald-800/40 bg-emerald-900/10 p-4">
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2">How to Fix</h4>
                <p className="text-emerald-300/80 text-sm mb-3">{getRemediationAdvice(selectedVuln.category)}</p>
                {getCodeExample(selectedVuln.category) && (
                  <pre className="mt-2 rounded-lg bg-black/60 border border-slate-800 p-3 text-xs text-emerald-400 font-mono overflow-x-auto whitespace-pre">
                    {getCodeExample(selectedVuln.category)}
                  </pre>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800">
                <Link
                  to={'/learn#' + selectedVuln.category}
                  className="text-primary-500 hover:text-primary-400 text-sm font-medium transition"
                >
                  Learn more about this vulnerability type →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const style = SEV[severity] || SEV.info;
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium uppercase ${style.bg}`}>
      {severity}
    </span>
  );
}

function getDetectionMethod(category) {
  const methods = {
    xss: 'A script tag was injected into query parameters and the response was checked for reflection.',
    sqli: 'SQL payloads were sent and the response was checked for database error messages.',
    headers: 'HTTP response headers were analyzed for missing security headers.',
    ssl: 'A TLS connection was established to inspect the certificate and protocol.',
    tls: 'A TLS connection was established to inspect the certificate and protocol.',
    traversal: 'Path traversal sequences were injected to attempt accessing sensitive files.',
    subdomain: 'Common subdomain names were resolved to discover exposed hosts.',
    cookies: 'Set-Cookie headers were inspected for missing security flags.',
    error: 'Requests were sent to trigger errors and check for stack trace exposure.',
    access_control: 'Numeric IDs were modified to test access control.',
    rate_limit: 'Multiple requests were sent to check for rate limiting.',
  };
  return methods[category] || 'Automated security checks were run against the target.';
}

function getRemediationAdvice(category) {
  const advice = {
    xss: 'Encode user input before rendering in HTML. Use Content-Security-Policy headers.',
    sqli: 'Use parameterized queries. Never concatenate user input into SQL.',
    headers: 'Add security headers: CSP, X-Frame-Options, HSTS, X-Content-Type-Options.',
    ssl: 'Use TLS 1.2+. Disable legacy protocols. Keep certificates up to date.',
    tls: 'Use TLS 1.2+. Disable legacy protocols. Keep certificates up to date.',
    traversal: 'Never use raw user input as file paths. Validate and sanitize.',
    subdomain: 'Audit subdomains regularly. Restrict access to dev/staging environments.',
    cookies: 'Set HttpOnly, Secure, and SameSite flags on all session cookies.',
    error: 'Return generic errors to users. Log details server-side only.',
    access_control: 'Check authorization on every request. Do not trust client IDs.',
    rate_limit: 'Implement rate limiting on login and sensitive endpoints.',
  };
  return advice[category] || 'Review the finding and implement appropriate security controls.';
}

function getCodeExample(category) {
  const examples = {
    xss: '// Use textContent instead of innerHTML\nelement.textContent = userInput;',
    sqli: '// Use parameterized queries\ndb.query("SELECT * FROM users WHERE id = ?", [id]);',
    headers: '// Add security headers with helmet\napp.use(helmet());',
    cookies: '// Secure cookie settings\nres.cookie("session", token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: "strict"\n});',
    rate_limit: '// Express rate limiter\nconst limit = rateLimit({ windowMs: 15*60*1000, max: 5 });\napp.use("/login", limit);',
  };
  return examples[category] || null;
}