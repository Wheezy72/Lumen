import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';
import SeverityMiniBar from '../components/ui/SeverityMiniBar.jsx';

const STATUS = {
  pass: { label: 'Pass', cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  fail: { label: 'Fail', cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  skipped: { label: 'Off', cls: 'bg-slate-500/10 text-gray-400 border border-slate-800' },
  unknown: { label: '—', cls: 'bg-slate-500/10 text-gray-400 border border-slate-800' },
};

export default function Targets() {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/targets');
      setTargets(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (['completed', 'failed'].includes(msg.type)) load();
      } catch {}
    };
    return () => es.close();
  }, []);

  const updateTarget = async (id, patch) => {
    setSavingId(id);
    try {
      const { data } = await axios.put(`/api/targets/${id}`, patch);
      setTargets((prev) => prev.map((t) => (t._id === id ? { ...t, ...data } : t)));
    } finally {
      setSavingId(null);
    }
  };

  const sorted = useMemo(() => {
    return [...targets].sort((a, b) => (a.host || '').localeCompare(b.host || ''));
  }, [targets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 mx-auto border-2 border-primary-500 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-500 text-sm">Loading targets…</p>
        </div>
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <EmptyState
        title="No targets yet"
        description="Targets appear automatically after you run scans. Start with a scan, then come back to set a baseline and enable policy gating."
        action={(
          <Link to="/new" className="btn btn-primary px-4 py-2 text-sm">
            Start a scan
          </Link>
        )}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Targets</h1>
          <p className="text-sm text-gray-500 mt-1">Baselines and policy gates (DevSecOps).</p>
        </div>
        <Link to="/scans" className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-200 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 transition">
          View scans
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.map((t) => (
          <TargetCard
            key={t._id}
            target={t}
            onUpdate={updateTarget}
            saving={savingId === t._id}
          />
        ))}
      </div>
    </div>
  );
}

function TargetCard({ target, onUpdate, saving }) {
  const recentCompleted = (target.recentScans || []).filter((s) => s.status === 'completed');
  const latest = (target.recentScans || [])[0];

  const policyStatus = latest?.policy?.status || 'unknown';
  const policyMeta = STATUS[policyStatus] || STATUS.unknown;

  const baselineLabel = target.baselineScanId ? 'Baseline set' : 'No baseline';

  const setBaselineToLatest = async () => {
    const scan = recentCompleted[0];
    if (!scan) return;
    await onUpdate(target._id, { baselineScanId: scan._id });
  };

  const clearBaseline = async () => {
    await onUpdate(target._id, { baselineScanId: '' });
  };

  const togglePolicy = async () => {
    await onUpdate(target._id, { policyEnabled: !target.policyEnabled });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-200 truncate">{target.host}</h3>
          <div className="mt-1 text-xs text-gray-600 flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-800">{baselineLabel}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${policyMeta.cls}`}>
              Policy: {policyMeta.label}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={togglePolicy}
          disabled={saving}
          className={`h-9 px-3 rounded-lg text-sm font-medium border transition ${
            target.policyEnabled
              ? 'bg-primary-500/15 text-primary-400 border-primary-500/25'
              : 'bg-slate-500/10 text-gray-400 border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800'
          } disabled:opacity-50`}
          title="Enable/disable policy gate"
        >
          {target.policyEnabled ? 'Policy on' : 'Policy off'}
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Latest scan</p>
        {latest ? (
          <div className="rounded-lg border border-slate-800 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{latest.targetUrl}</p>
                <p className="text-xs text-gray-600 mt-0.5 capitalize">{latest.status} • {latest.progress ?? 0}%</p>
              </div>
              <Link
                to={`/report/${latest._id}`}
                className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition"
              >
                Open report →
              </Link>
            </div>

            <div className="mt-3">
              <SeverityMiniBar findings={latest.results || []} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">No scans found for this target yet.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setBaselineToLatest}
          disabled={saving || !recentCompleted.length}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-300 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 transition disabled:opacity-40"
          title={!recentCompleted.length ? 'Run a scan to create a baseline' : 'Use latest completed scan as baseline'}
        >
          Set baseline to latest
        </button>
        <button
          type="button"
          onClick={clearBaseline}
          disabled={saving || !target.baselineScanId}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-300 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 transition disabled:opacity-40"
        >
          Clear baseline
        </button>
        <Link
          to="/new"
          className="px-3 py-2 rounded-lg text-sm font-medium btn btn-primary"
        >
          New scan
        </Link>
      </div>

      <p className="mt-4 text-xs text-gray-600 leading-relaxed">
        Baselines let you see regressions. With policy enabled, any new High/Critical findings compared to the baseline will mark the scan as <span className="text-red-400">Policy: Fail</span>.
      </p>
    </div>
  );
}
