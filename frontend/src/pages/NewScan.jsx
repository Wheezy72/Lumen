import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../components/ui/Card.jsx';

const SCAN_MODULES = [
  { id: 'headers', name: 'Security Headers', description: 'Check for missing security headers' },
  { id: 'cookies', name: 'Cookie Security', description: 'Check cookie security flags' },
  { id: 'tls', name: 'TLS/SSL', description: 'Check certificate and protocol security' },
  { id: 'xss', name: 'XSS Detection', description: 'Test for cross-site scripting' },
  { id: 'sqli', name: 'SQL Injection', description: 'Test for SQL injection vulnerabilities' },
  { id: 'traversal', name: 'Path Traversal', description: 'Test for directory traversal' },
  { id: 'subdomain', name: 'Subdomain Scan', description: 'Discover subdomains' },
  { id: 'error', name: 'Error Disclosure', description: 'Check for verbose error messages' },
  { id: 'rate_limit', name: 'Rate Limiting', description: 'Check for rate limit protection' },
  { id: 'access_control', name: 'Access Control', description: 'Test access control issues' }
];

const SCAN_PROFILES = {
  quick: {
    name: 'Quick scan',
    description: 'Headers + cookies only (~10 seconds)',
    modules: ['headers', 'cookies']
  },
  standard: {
    name: 'Standard scan',
    description: 'A sensible default set of checks (~30 seconds)',
    modules: ['headers', 'cookies', 'tls', 'error', 'rate_limit']
  },
  full: {
    name: 'Full scan',
    description: 'Runs all checks (~2 minutes)',
    modules: SCAN_MODULES.map((m) => m.id)
  },
  custom: {
    name: 'Custom',
    description: 'Choose checks manually',
    modules: []
  }
};

export default function NewScan() {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState('');
  const [profile, setProfile] = useState('standard');
  const [customModules, setCustomModules] = useState([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleModule = (moduleId) => {
    setCustomModules((prev) =>
      prev.includes(moduleId) ? prev.filter((m) => m !== moduleId) : [...prev, moduleId]
    );
  };

  const getSelectedModules = () => {
    if (profile === 'custom') return customModules;
    return SCAN_PROFILES[profile].modules;
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!targetUrl.trim()) {
      setError('Please enter a site URL');
      return;
    }

    let url = targetUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    const modules = getSelectedModules();
    if (modules.length === 0) {
      setError('Please select at least one check');
      return;
    }

    if (scheduleEnabled && !scheduledTime) {
      setError('Please choose a time');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        targetUrl: url,
        scanProfile: modules,
      };

      if (scheduleEnabled && scheduledTime) {
        payload.scheduledFor = new Date(scheduledTime).toISOString();
      }

      const response = await axios.post('/api/scans', payload);
      navigate('/report/' + response.data._id);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to start scan';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedModules = getSelectedModules();

  const targetPreview = (() => {
    const raw = targetUrl.trim();
    if (!raw) return '—';

    try {
      const maybeUrl = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      const u = new URL(maybeUrl);
      return u.hostname || raw;
    } catch {
      return raw;
    }
  })();

  const estimate = (() => {
    if (profile === 'quick') return 'About 10 seconds';
    if (profile === 'standard') return 'About 30 seconds';
    if (profile === 'full') return 'About 2 minutes';
    return selectedModules.length <= 2 ? 'About 10 seconds' : selectedModules.length <= 5 ? 'About 30 seconds' : 'About 2 minutes';
  })();

  return (
    <div className="max-w-6xl mx-auto text-gray-300">
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">New scan</h1>
        <p className="text-gray-400 mt-1">Enter a site URL and choose what checks to run.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Card className="p-6">
              <CardHeader
                title="Site"
                description="We will scan the public-facing HTTP interface only."
              />

              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-400 mb-2">URL</label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="input input-plain"
                />
                <p className="text-sm text-gray-500 mt-2">Example: https://example.com</p>
              </div>
            </Card>

            <Card className="p-6">
              <CardHeader
                title="Scan profile"
                description="Pick a preset, or choose checks manually."
              />

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(SCAN_PROFILES).map(([key, profileData]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setProfile(key)}
                    className={
                      'text-left p-4 border rounded-lg transition ' +
                      (profile === key
                        ? 'border-primary-500 bg-primary-900/20'
                        : 'border-slate-700 hover:border-slate-500 hover:bg-black/5 dark:hover:bg-slate-800/40')
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={
                          'w-4 h-4 rounded-full border-2 flex items-center justify-center ' +
                          (profile === key ? 'border-primary-500' : 'border-slate-600')
                        }
                      >
                        {profile === key && <div className="w-2 h-2 bg-primary-500 rounded-full" />}
                      </div>
                      <span className="font-medium text-gray-200">{profileData.name}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2 ml-7">{profileData.description}</p>
                  </button>
                ))}
              </div>
            </Card>

            {profile === 'custom' && (
              <Card className="p-6 animate-slide-up">
                <CardHeader
                  title="Checks"
                  description="Select the checks to run for this scan."
                />

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SCAN_MODULES.map((module) => (
                    <label
                      key={module.id}
                      className={
                        'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ' +
                        (customModules.includes(module.id)
                          ? 'border-primary-500 bg-primary-900/10'
                          : 'border-slate-700 hover:border-slate-500 hover:bg-black/5 dark:hover:bg-slate-800/40')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={customModules.includes(module.id)}
                        onChange={() => toggleModule(module.id)}
                        className="sr-only peer"
                      />
                      <div className="mt-0.5 h-5 w-5 rounded-md border border-slate-700 bg-black/5 dark:bg-black/40 flex items-center justify-center transition peer-checked:border-primary-500 peer-checked:bg-primary-500/15">
                        <svg
                          className="w-4 h-4 text-primary-400 opacity-0 transition-opacity peer-checked:opacity-100"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-medium text-gray-200">{module.name}</span>
                        <p className="text-sm text-gray-500">{module.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-6">
              <CardHeader
                title="Schedule"
                description={scheduleEnabled ? 'Run later' : 'Start immediately'}
                actions={
                  <button
                    type="button"
                    onClick={() => setScheduleEnabled((v) => !v)}
                    className="inline-flex items-center gap-3"
                    aria-pressed={scheduleEnabled}
                  >
                    <span className="text-sm text-gray-400">Run later</span>
                    <span
                      className={`h-6 w-11 rounded-full border transition relative ${
                        scheduleEnabled
                          ? 'bg-primary-500/20 border-primary-500/30'
                          : 'bg-black/5 dark:bg-black/30 border-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full transition ${
                          scheduleEnabled ? 'bg-primary-400 left-6' : 'bg-slate-500 left-1'
                        }`}
                      />
                    </span>
                  </button>
                }
              />

              {scheduleEnabled ? (
                <div className="mt-5 animate-slide-up">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Run at</label>
                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    min={getMinDateTime()}
                    className="input input-plain"
                  />
                  <p className="text-sm text-gray-500 mt-2">The scan will start automatically at the selected time.</p>
                </div>
              ) : (
                <div className="mt-5 text-sm text-gray-500">
                  Start a scan now, then track progress live in the report.
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 space-y-6">
              <Card className="p-6 bg-gradient-to-br from-primary-500/5 via-transparent to-secondary-500/5">
                <h2 className="text-lg font-semibold text-white">Summary</h2>
                <p className="text-sm text-gray-500 mt-1">Confirm what will run before starting the scan.</p>

                <div className="mt-5 space-y-4">
                  <div className="rounded-lg border border-slate-800 bg-black/5 dark:bg-black/30 p-4">
                    <p className="text-xs text-gray-600">Target</p>
                    <p className="text-sm text-gray-200 font-semibold mt-1 break-all">{targetPreview}</p>
                    <p className="text-xs text-gray-600 mt-2">Estimated duration: <span className="text-gray-300">{estimate}</span></p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Checks ({selectedModules.length})</p>
                    {selectedModules.length === 0 ? (
                      <p className="text-sm text-gray-600 mt-2">Select at least one check.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedModules.map((m) => (
                          <span
                            key={m}
                            className="px-2.5 py-1 rounded-full text-xs font-medium bg-secondary-500/10 text-secondary-400 border border-secondary-500/20"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-black/5 dark:bg-black/30 p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-500">
                      <li>Only scan systems you own or have permission to test.</li>
                      <li>Some targets may be blocked by policy (private networks / localhost).</li>
                      <li>Results include evidence and basic guidance for fixes.</li>
                    </ul>
                  </div>
                </div>
              </Card>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/scans')}
                  className="px-6 py-3 border border-slate-700 text-gray-400 rounded-lg hover:bg-black/5 dark:hover:bg-slate-800 transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 btn-primary rounded-lg transition disabled:opacity-50"
                >
                  {loading ? 'Starting…' : scheduleEnabled ? 'Schedule scan' : 'Start scan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}