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
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
        if (msg.scanId !== scanId) return;

        if (msg.type === 'progress') {
          setScan((prev) => (prev ? { ...prev, progress: msg.progress ?? prev.progress, status: 'running' } : prev));
        } else if (msg.type === 'failed') {
          setScan((prev) => (prev ? { ...prev, status: 'failed', error: msg.error || prev.error } : prev));
        } else if (msg.type === 'completed') {
          loadScan();
        }
      } catch {}
    };
    return () => es.close();
  }, [scanId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [severityFilter, categoryFilter, scanId]);

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

  const categories = Array.from(
    new Set(findings.map((f) => (f.category || 'other').toLowerCase())),
  ).sort();

  const filteredFindings = findings.filter((f) => {
    const title = (f.title || '').toLowerCase();
    const category = (f.category || 'other').toLowerCase();
    const sev = (f.severity || 'info').toLowerCase();

    if (severityFilter !== 'all' && sev !== severityFilter) return false;
    if (categoryFilter !== 'all' && category !== categoryFilter) return false;

    return true;
  });

  const selectedVuln = filteredFindings[selectedIndex];

  const sevCounts = findings.reduce((acc, f) => {
    const s = (f.severity || 'info').toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = findings.reduce((acc, f) => {
    const c = (f.category || 'other').toLowerCase();
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  const statusColor = scan?.status === 'completed' ? 'text-emerald-400'
    : scan?.status === 'running' ? 'text-blue-400'
    : scan?.status === 'failed' ? 'text-red-400'
    : 'text-gray-400';

  const formatLocalDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Scan Report</h1>
          <p className="text-gray-500 mt-1 break-all text-sm">{scan?.targetUrl}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={generatePdf}
            disabled={pdfLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-200 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 disabled:opacity-50 transition"
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
            <p className="font-semibold text-white">{formatLocalDateTime(scan?.startedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Completed</p>
            <p className="font-semibold text-white">{formatLocalDateTime(scan?.completedAt)}</p>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar progress={scan?.progress ?? 0} running={scan?.status === 'running' || scan?.status === 'queued' || scan?.status === 'scheduled'} />
        </div>

        {findings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={severityFilter === 'all'}
                onClick={() => setSeverityFilter('all')}
                className="bg-slate-500/10 text-gray-400 border border-slate-800"
                label={`All (${findings.length})`}
              />
              {['critical','high','medium','low','info'].map((s) =>
                sevCounts[s] ? (
                  <FilterChip
                    key={s}
                    active={severityFilter === s}
                    onClick={() => setSeverityFilter(s)}
                    className={SEV[s]?.bg}
                    label={`${sevCounts[s]} ${s.charAt(0).toUpperCase() + s.slice(1)}`}
                  />
                ) : null
              )}
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={categoryFilter === 'all'}
                  onClick={() => setCategoryFilter('all')}
                  className="bg-slate-500/10 text-gray-400 border border-slate-800"
                  label="All topics"
                />
                {categories.map((c) => (
                  <FilterChip
                    key={c}
                    active={categoryFilter === c}
                    onClick={() => setCategoryFilter(c)}
                    className="bg-primary-500/10 text-primary-400 border border-primary-500/20"
                    label={`${c}${categoryCounts[c] ? ` (${categoryCounts[c]})` : ''}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Findings + Detail ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Findings list */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-4">
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="font-semibold text-white text-sm">
              Findings <span className="text-gray-600 font-normal">({filteredFindings.length}{filteredFindings.length !== findings.length ? ` / ${findings.length}` : ''})</span>
            </h2>
            {(severityFilter !== 'all' || categoryFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('all');
                  setCategoryFilter('all');
                }}
                className="text-xs text-gray-500 hover:text-white transition"
              >
                Reset filters
              </button>
            )}
          </div>

          {findings.length === 0 ? (
            <div className="py-10 text-center text-gray-600 text-sm">No vulnerabilities found.</div>
          ) : filteredFindings.length === 0 ? (
            <div className="py-10 text-center text-gray-600 text-sm">No matches for your filters.</div>
          ) : (
            <ul className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredFindings.map((f, i) => {
                const sev = (f.severity || 'info').toLowerCase();
                const active = i === selectedIndex;
                return (
                  <li
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`p-3 rounded-lg cursor-pointer transition border ${
                      active
                        ? 'bg-primary-900/30 border-primary-700/50'
                        : 'border-transparent hover:bg-black/5 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-gray-200 font-medium leading-snug">{f.title}</span>
                      <SeverityBadge severity={sev} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <CategoryBadge category={(f.category || 'other').toLowerCase()} />
                      {f.cve && <span className="text-xs text-gray-500 font-mono">{f.cve}</span>}
                    </div>
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
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={(selectedVuln.category || 'other').toLowerCase()} />
                    {selectedVuln.cve && <span className="text-xs text-gray-500 font-mono">{selectedVuln.cve}</span>}
                  </div>
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
                  to={'/learn#' + (selectedVuln.category || 'other')}
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

function FilterChip({ active, onClick, className, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition ${className} ${
        active ? 'ring-2 ring-primary-500/30' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  );
}

function CategoryBadge({ category }) {
  const label = category || 'other';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary-500/10 text-secondary-400 border border-secondary-500/20">
      {label}
    </span>
  );
}



function ProgressBar({ progress, running }) {
  const pct = Math.min(100, Math.max(0, progress ?? 0));

  return (
    <div className="space-y-2">
      <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${running ? 'progress-fill-running' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="capitalize">{running ? 'Scanning…' : 'Complete'}</span>
        <span className="tabular-nums">{pct}%</span>
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