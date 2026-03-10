import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';

const WARNING_STYLE = 'bg-red-500/15 text-red-400 border border-red-500/30';

export default function Changes() {
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await axios.get('/api/scans/changes');
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
    return (items || []).map((scan) => {
      const host = scan.targetHost || (() => {
        try {
          return new URL(scan.targetUrl).hostname;
        } catch {
          return scan.targetUrl;
        }
      })();

      const newHighCritical = scan.diffSummary?.newBlockedCount ?? 0;

      return {
        id: scan._id,
        host,
        url: scan.targetUrl,
        completedAt: scan.completedAt,
        newCount: scan.diffSummary?.newCount ?? 0,
        fixedCount: scan.diffSummary?.fixedCount ?? 0,
        persistingCount: scan.diffSummary?.persistingCount ?? 0,
        newHighCritical,
      };
    });
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Changes</h1>
          <p className="text-sm text-gray-500 mt-1">What changed since the previous scan for each site.</p>
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
          title="Nothing to compare yet"
          description="Run a scan twice for the same site to see what's new, fixed, or still present."
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Changes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attention</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors duration-150">
                  <td className="px-4 py-3 align-middle">
                    <div className="font-medium text-white truncate max-w-xs">{row.host}</div>
                    <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs">{row.url}</div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        New: {row.newCount}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Fixed: {row.fixedCount}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 text-gray-400 border border-slate-800">
                        Still present: {row.persistingCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {row.newHighCritical > 0 ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${WARNING_STYLE}`}>
                        Warning ({row.newHighCritical})
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-gray-500">
                    {formatLocalDateTime(row.completedAt)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Link
                      to={`/report/${row.id}`}
                      className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
