import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Settings({ user, onUpdateUser }) {
  const [form, setForm] = useState({ name: '', email: '', emailAlertsEnabled: false });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState('');

  const hydrate = (u) => {
    setForm({
      name: u?.name || '',
      email: u?.email || '',
      emailAlertsEnabled: Boolean(u?.emailAlertsEnabled),
    });
  };

  useEffect(() => {
    hydrate(user);

    const load = async () => {
      try {
        const { data } = await axios.get('/api/users/me');
        hydrate(data);
        onUpdateUser?.(data);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    setError('');

    try {
      const payload = {
        name: form.name,
        email: form.email,
        emailAlertsEnabled: form.emailAlertsEnabled,
      };

      const { data } = await axios.put('/api/users/me', payload);
      onUpdateUser?.(data);
      hydrate(data);
      setStatus('Saved');
    } catch (e2) {
      setError(e2.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const canEnableAlerts = Boolean(form.email.trim());

  const loadToken = async () => {
    setTokenStatus('');
    try {
      const { data } = await axios.get('/api/auth/token');
      setApiToken(data?.token || '');
    } catch {
      setTokenStatus('Failed to load token');
    }
  };

  const copyToken = async () => {
    if (!apiToken) return;
    try {
      await navigator.clipboard.writeText(apiToken);
      setTokenStatus('Copied');
      setTimeout(() => setTokenStatus(''), 1500);
    } catch {
      setTokenStatus('Copy failed');
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm">Manage your profile and notification preferences.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {status && (
        <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-500/25 rounded-lg">
          <p className="text-emerald-300 text-sm">{status}</p>
        </div>
      )}

      <form onSubmit={save} className="space-y-6">
        <div className="bg-dark-200 rounded-xl border border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Profile</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Display name</label>
              <input
                type="text"
                className="input input-plain"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
              <input
                type="email"
                className="input input-plain"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="Optional (used for alerts)"
              />
              <p className="text-xs text-gray-500 mt-2">
                Email is optional. If you don’t add one, alerts stay disabled.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-dark-200 rounded-xl border border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Notifications</h2>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.emailAlertsEnabled}
              onChange={(e) => setForm((p) => ({ ...p, emailAlertsEnabled: e.target.checked }))}
              disabled={!canEnableAlerts}
              className="mt-1 w-4 h-4 text-primary-500 bg-black/5 dark:bg-black/40 border-slate-600 rounded disabled:opacity-40"
            />
            <div>
              <div className="text-sm font-medium text-gray-300">Email alerts</div>
              <div className="text-xs text-gray-500 mt-1">
                Sends you a short summary when a scan finds vulnerabilities.
              </div>
              {!canEnableAlerts && (
                <div className="text-xs text-amber-400/90 mt-2">
                  Add an email address above to enable alerts.
                </div>
              )}
            </div>
          </label>
        </div>

        <div className="bg-dark-200 rounded-xl border border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">API access</h2>
          <p className="text-sm text-gray-500">Use this token in the Authorization header to call the API.</p>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={loadToken}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-800 bg-slate-500/10 text-gray-400 hover:bg-black/5 dark:hover:bg-slate-800 transition"
            >
              Generate token
            </button>
            <button
              type="button"
              onClick={copyToken}
              disabled={!apiToken}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-800 bg-slate-500/10 text-gray-400 hover:bg-black/5 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Copy
            </button>
          </div>

          {apiToken && (
            <div className="mt-4 rounded-lg bg-black/5 dark:bg-black/55 border border-slate-800 p-3 text-xs text-gray-300 font-mono break-all">
              {apiToken}
            </div>
          )}

          {tokenStatus && (
            <div className="mt-3 text-xs text-gray-500">{tokenStatus}</div>
          )}

          <div className="mt-4 text-xs text-gray-500 font-mono whitespace-pre-wrap">
            {`Example:\nAuthorization: Bearer <token>\n\nPOST /api/v1/scans`}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary px-5 py-2.5 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
