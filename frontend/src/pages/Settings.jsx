import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function Settings({ user, onUpdateUser }) {
  const [form, setForm] = useState({ username: '', email: '', emailAlertsEnabled: false });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const hydrate = (u) => {
    setForm({
      username: u?.username || '',
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
        username: form.username,
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
              <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
              <input
                type="text"
                className="input input-plain"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="Choose a username"
              />
              <p className="text-xs text-gray-500 mt-2">
                This is the name you use to sign in.
              </p>
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
