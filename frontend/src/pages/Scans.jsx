import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import AnimatedProgressBar from '../components/ui/AnimatedProgressBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import SeverityMiniBar from '../components/ui/SeverityMiniBar.jsx';
import { formatLocalDateTime } from '../utils/dates.js';

const STATUS_STYLES = {
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  running:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  queued:    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  failed:    'bg-red-500/15 text-red-400 border border-red-500/30',
  scheduled: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};

const WARNING_STYLE = 'bg-red-500/15 text-red-400 border border-red-500/30';

export default function Scans() {
  const [scans, setScans] = useState([]);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get('/api/scans');
      setScans(data);
    } catch {
      // backend may not be running
    }
  };

  useEffect(() => {
    load();

    const es = new EventSource('/api/sse/events');

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const { scanId, type, progress } = msg;
        if (!scanId) return;

        setScans((prev) => {
          const idx = prev.findIndex((s) => s._id === scanId);
          if (idx === -1) { load(); return prev; }

          const updated = [...prev];
          const scan = { ...updated[idx] };

          if (type === 'progress') {
            scan.progress = progress ?? scan.progress;
            if (scan.status !== 'completed') scan.status = 'running';
          } else if (type === 'completed') {
            scan.status = 'completed';
            scan.progress = 100;
          } else if (type === 'failed') {
            if (scan.status !== 'completed') scan.status = 'failed';
          }

          updated[idx] = scan;
          return updated;
        });
      } catch {}
    };

    es.onerror = () => {};
    return () => es.close();
  }, []);

  const downloadReport = async (scanId, type) => {
    try {
      setDownloading({ scanId, type });
      const endpoint = type === 'pdf' ? '/api/reports/pdf' : '/api/reports/csv';
      const { data } = await axios.post(endpoint, { scanId });
      if (data?.url) window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      console.error('Report download error:', e.response?.data || e.message);
    } finally {
      setDownloading(null);
    }
  };

  const deleteScan = async (scanId) => {
    if (!window.confirm('Delete this scan? This cannot be undone.')) return;
    try {
      setDeleting(scanId);
      await axios.delete(`/api/scans/${scanId}`);
      setScans((prev) => prev.filter((s) => s._id !== scanId));
    } catch (e) {
      console.error('Delete error:', e.response?.data || e.message);
    } finally {
      setDeleting(null);
    }
  };

  const isDownloading = (scanId, type) =>
    downloading?.scanId === scanId && downloading?.type === type;

  const hasScans = scans.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Scans</h1>
          <p className="text-sm text-gray-500 mt-1">
            {scans.length} scan{scans.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link to="/new" className="btn btn-primary text-sm px-4 py-2 shrink-0">
          + New scan
        </Link>
      </div>

      {!hasScans ? (
        <EmptyState
          title="No scans yet"
          description="Create a scan to start tracking changes over time."
          action={(
            <Link to="/new" className="btn btn-primary text-sm px-4 py-2">
              Start your first scan
            </Link>
          )}
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-dark-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Report</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {scans.map((s) => (
                <ScanRow
                  key={s._id}
                  scan={s}
                  onDownload={downloadReport}
                  isDownloading={isDownloading}
                  onDelete={deleteScan}
                  isDeleting={deleting === s._id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScanRow({ scan, onDownload, isDownloading, onDelete, isDeleting }) {
  const { _id, targetUrl, targetHost, status, progress, startedAt, results, diffSummary } = scan;
  const badgeStyle = STATUS_STYLES[status] || STATUS_STYLES.queued;
  const pct = Math.min(100, Math.max(0, progress ?? 0));
  const running = ['running', 'queued', 'scheduled'].includes(status);
  const newHighCritical = diffSummary?.newBlockedCount ?? 0;

  const host = useMemo(() => {
    if (targetHost) return targetHost;
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return targetUrl;
    }
  }, [targetHost, targetUrl]);

  return (
    <tr className="hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors duration-150">
      <td className="px-4 py-3 align-middle">
        <div className="font-medium text-white truncate max-w-xs">{host}</div>
        <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs">{targetUrl}</div>
        <div className="text-xs text-gray-600 mt-1">{formatLocalDateTime(startedAt, null, 'Queued')}</div>
        {status === 'completed' && (
          <div className="mt-2">
            <SeverityMiniBar findings={results || []} />
          </div>
        )}
      </td>

      <td className="px-4 py-3 align-middle">
        <div className="space-y-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeStyle}`}>
            {status === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
            {status}
          </span>
          {newHighCritical > 0 && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${WARNING_STYLE}`}>
              Warning ({newHighCritical})
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <AnimatedProgressBar progress={pct} running={running} compact />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{pct}%</span>
        </div>
      </td>

      <td className="px-4 py-3 align-middle">
        {status === 'completed' ? (
          <div className="flex items-center gap-3">
            <Link
              to={`/report/${_id}`}
              className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => onDownload(_id, 'pdf')}
              disabled={isDownloading(_id, 'pdf')}
              className="text-xs text-gray-500 hover:text-white transition disabled:opacity-40"
            >
              {isDownloading(_id, 'pdf') ? 'PDF…' : 'PDF'}
            </button>
            <span className="text-slate-700">·</span>
            <button
              type="button"
              onClick={() => onDownload(_id, 'csv')}
              disabled={isDownloading(_id, 'csv')}
              className="text-xs text-gray-500 hover:text-white transition disabled:opacity-40"
            >
              {isDownloading(_id, 'csv') ? 'CSV…' : 'CSV'}
            </button>
          </div>
        ) : running ? (
          <span className="text-xs text-gray-600 italic">Scanning…</span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>

      <td className="px-4 py-3 align-middle">
        <button
          type="button"
          onClick={() => onDelete(_id)}
          disabled={isDeleting || status === 'running'}
          className="text-xs text-red-500/60 hover:text-red-400 transition disabled:opacity-30"
          title="Delete scan"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}