import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { formatLocalDateTime, timeAgo } from '../utils/dates.js';
import { targetLabel } from '../utils/targetLabel.js';

const WARNING_STYLE = 'bg-red-500/15 text-red-400 border border-red-500/30';

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i}>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-4 w-32 mb-2" />
            <div className="skeleton h-3 w-48" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="flex gap-2">
              <div className="skeleton h-5 w-16 rounded-full" />
              <div className="skeleton h-5 w-16 rounded-full" />
              <div className="skeleton h-5 w-24 rounded-full" />
            </div>
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-5 w-20 rounded-full" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-4 w-24" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-4 w-12" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function Changes() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const load = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const { data } = await axios.get('/api/scans/changes');
      setItems(data || []);
      if (isManual) {
        setLastRefreshed(new Date());
        toast({ type: 'success', message: 'Changes refreshed.' });
      }
    } catch {
      if (isManual) toast({ type: 'error', message: 'Failed to refresh changes.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    return (items || []).map((scan) => {
      const host = targetLabel(scan.targetUrl, scan.targetHost);

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
          <h1 className="text-2xl font-bold text-slate-900 dark:bg-gradient-to-r dark:from-primary-400 dark:to-secondary-400 dark:bg-clip-text dark:text-transparent">Changes</h1>
          <p className="text-sm text-gray-500 mt-1">What changed since the previous scan for each site.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-500 hidden sm:block" title={formatLocalDateTime(lastRefreshed)}>
              Updated {timeAgo(lastRefreshed) ?? formatLocalDateTime(lastRefreshed)}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-dark-200 border border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? (
              <>
                <span className="loading-spinner w-3.5 h-3.5 border-[1.5px]" />
                Refreshing…
              </>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

      {!loading && rows.length === 0 ? (
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
            <thead className="sticky top-0 z-10 bg-dark-200 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Changes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attention</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <SkeletonRows />
              ) : (
                rows.map((row) => {
                  const relativeTime = timeAgo(row.completedAt);
                  const absoluteTime = formatLocalDateTime(row.completedAt);
                  return (
                    <tr key={row.id} className="hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors duration-150">
                      <td className="px-4 py-3 align-middle">
                        <div className="font-medium text-white truncate max-w-xs" title={row.host}>{row.host}</div>
                        <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs" title={row.url}>{row.url}</div>
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
                      <td className="px-4 py-3 align-middle text-xs text-gray-500" title={absoluteTime}>
                        {relativeTime ?? absoluteTime}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
