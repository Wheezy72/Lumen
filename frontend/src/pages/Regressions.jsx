import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';

const POLICY_STYLES = {
  pass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  fail: 'bg-red-500/15 text-red-400 border border-red-500/30',
  skipped: 'bg-slate-500/10 text-gray-400 border border-slate-800',
  unknown: 'bg-slate-500/10 text-gray-400 border border-slate-800',
};

export default function Regressions() {
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await axios.get('/api/scans/regressions');
    setItems(data || []);
  };

  useEffect(() => {
    load();
  }, []);

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

  const rows = useMemo(() => {
    return (items || []).map((s) => {
      const host = s.targetHost || (() => {
        try {
          return new URL(s.targetUrl).hostname;
        } catch {
          return s.targetUrl;
        }
      })();

      return {
        id: s._id,
        host,
        url: s.targetUrl,
        completedAt: s.completedAt,
        policy: (s.policy?.status || 'unknown').toLowerCase(),
        newCount: s.diffSummary?.newCount ?? 0,
        fixedCount: s.diffSummary?.fixedCount ?? 0,
        persistingCount: s.diffSummary?.persistingCount ?? 0,
      };
    });
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Regressions</h1>
          <p className="text-sm text-gray-500 mt-1">Scans that introduced new findings compared to the previous scan.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-200 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 transition"
        >
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No regressions detected"
          description="Once you run at least two scans for the same host, Lumen will highlight new issues here."
          action={(
            <Link to="/new" className="btn btn-primary text-sm px-4 py-2">
              New scan
            </Link>
          )}
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-dark-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Diff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Policy</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => {
                const policyStyle = POLICY_STYLES[r.policy] || POLICY_STYLES.unknown;
                return (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors duration-150">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-white truncate max-w-xs">{r.host}</div>
                      <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs">{r.url}</div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                          New: {r.newCount}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Fixed: {r.fixedCount}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 text-gray-400 border border-slate-800">
                          Persist: {r.persistingCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${policyStyle}`}>
                        {r.policy === 'unknown' ? 'Policy: —' : `Policy: ${r.policy}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-gray-500">
                      {formatLocalDateTime(r.completedAt)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link
                        to={`/report/${r.id}`}
                        className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
