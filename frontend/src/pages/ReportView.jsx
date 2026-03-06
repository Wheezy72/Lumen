import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';

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
    } catch (err) {
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
    } catch (err) {
      alert('Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const generateCsv = async () => {
    try {
      setCsvLoading(true);
      const { data } = await axios.post('/api/reports/csv', { scanId });
      window.open(data.url, '_blank');
    } catch (err) {
      alert('Failed to generate CSV');
    } finally {
      setCsvLoading(false);
    }
  };

  useEffect(() => {
    loadScan();
    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.scanId === scanId) {
        loadScan();
      }
    };
    return () => es.close();
  }, [scanId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 mx-auto border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-gray-600">Loading scan results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <button onClick={loadScan} className="text-blue-600 hover:underline">Try again</button>
      </div>
    );
  }

  const selectedVuln = scan?.results?.[selectedIndex];
  const findings = scan?.results || [];

  const severityCounts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Report</h1>
          <p className="text-gray-600 mt-1 break-all">{scan?.targetUrl}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generatePdf}
            disabled={pdfLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {pdfLoading ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            onClick={generateCsv}
            disabled={csvLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {csvLoading ? 'Generating...' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-semibold capitalize">{scan?.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Progress</p>
            <p className="font-semibold">{scan?.progress}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Started</p>
            <p className="font-semibold">{scan?.startedAt ? new Date(scan.startedAt).toLocaleString() : '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Completed</p>
            <p className="font-semibold">{scan?.completedAt ? new Date(scan.completedAt).toLocaleString() : '-'}</p>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3">
            {severityCounts.critical > 0 && (
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                {severityCounts.critical} Critical
              </span>
            )}
            {severityCounts.high > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                {severityCounts.high} High
              </span>
            )}
            {severityCounts.medium > 0 && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                {severityCounts.medium} Medium
              </span>
            )}
            {severityCounts.low > 0 && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {severityCounts.low} Low
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Findings ({findings.length})</h2>
          
          {findings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No vulnerabilities found</p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-[500px] overflow-y-auto">
              {findings.map((finding, index) => (
                <li
                  key={index}
                  onClick={() => setSelectedIndex(index)}
                  className={'p-3 rounded-lg cursor-pointer transition ' + (index === selectedIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900">{finding.title}</span>
                    <SeverityBadge severity={finding.severity} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{finding.category}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Finding Details</h2>
          
          {!selectedVuln ? (
            <div className="text-center py-12 text-gray-500">
              <p>Select a finding from the list</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedVuln.title}</h3>
                  <SeverityBadge severity={selectedVuln.severity} />
                </div>
                <p className="text-sm text-gray-500 mt-1">Category: {selectedVuln.category}</p>
              </div>

              {selectedVuln.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                  <p className="text-gray-600">{selectedVuln.description}</p>
                </div>
              )}

              {selectedVuln.evidence && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Evidence</h4>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 font-mono break-all">
                    {selectedVuln.evidence}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">How it was detected</h4>
                <p className="text-gray-600 text-sm">{getDetectionMethod(selectedVuln.category)}</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-green-800 mb-2">How to Fix</h4>
                <p className="text-green-700 text-sm mb-3">{getRemediationAdvice(selectedVuln.category)}</p>
                
                {getCodeExample(selectedVuln.category) && (
                  <pre className="mt-3 bg-gray-800 rounded-lg p-3 overflow-x-auto text-sm text-green-400 whitespace-pre">
                    {getCodeExample(selectedVuln.category)}
                  </pre>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <Link
                  to={'/learn#' + selectedVuln.category}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Learn more about this vulnerability type
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
  const colors = {
    critical: 'bg-purple-100 text-purple-800',
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={'px-2 py-1 rounded text-xs font-medium uppercase ' + (colors[severity] || colors.low)}>
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
