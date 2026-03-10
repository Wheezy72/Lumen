import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const STATUS_STYLES = {
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  running:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  queued:    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  failed:    'bg-red-500/15 text-red-400 border border-red-500/30',
  scheduled: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};

const BAR_COLORS = {
  completed: 'bg-emerald-500',
  running:   'bg-blue-500',
  queued:    'bg-amber-500',
  failed:    'bg-red-500',
  scheduled: 'bg-purple-500',
};

export default function Scans() {
  const [scans, setScans] = useState([]);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    const { data } = await axios.get('/api/scans');
    setScans(data);
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

      <div className="rounded-xl border border-slate-800 bg-dark-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Progress</th>
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
            {!scans.length && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-600">
                  No scans yet.{' '}
                  <Link to="/new" className="text-primary-500 hover:underline">
                    Start your first scan →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScanRow({ scan, onDownload, isDownloading, onDelete, isDeleting }) {
  const { _id, targetUrl, status, progress, startedAt } = scan;
  const barColor = BAR_COLORS[status] || BAR_COLORS.queued;
  const badgeStyle = STATUS_STYLES[status] || STATUS_STYLES.queued;
  const pct = Math.min(100, Math.max(0, progress ?? 0));

  const formatLocalDateTime = (value) => {
    if (!value) return 'Queued';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Queued';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  return (
    <tr className="hover:bg-white/[0.02] transition-colors duration-150">
      <td className="px-4 py-3 align-middle">
        <div className="font-medium text-white truncate max-w-xs">{targetUrl}</div>
        <div className="text-xs text-gray-600 mt-0.5">
          {formatLocalDateTime(startedAt)}
        </div>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeStyle}`}>
          {status === 'running' && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
          {status}
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${status === 'running' ? 'progress-fill-running' : barColor}`}
              style={{ width: `${pct}%` }}
            />
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
        ) : status === 'running' || status === 'queued' ? (
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