import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import AnimatedProgressBar from '../components/ui/AnimatedProgressBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import SeverityMiniBar from '../components/ui/SeverityMiniBar.jsx';
import Modal from '../components/ui/Modal.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { formatLocalDateTime, timeAgo } from '../utils/dates.js';

const STATUS_STYLES = {
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  running:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  queued:    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  failed:    'bg-red-500/15 text-red-400 border border-red-500/30',
  scheduled: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};

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
            <div className="skeleton h-6 w-20 rounded-full" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-2 w-full rounded-full" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-4 w-16" />
          </td>
          <td className="px-4 py-4 align-middle">
            <div className="skeleton h-4 w-12" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function Scans() {
  const toast = useToast();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get('/api/scans');
      setScans(data);
    } catch {
      // backend may not be running
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
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener');
        toast({ type: 'success', message: `${type.toUpperCase()} report ready.` });
      }
    } catch (e) {
      toast({ type: 'error', message: `Failed to generate ${type.toUpperCase()} report.` });
      console.error('Report download error:', e.response?.data || e.message);
    } finally {
      setDownloading(null);
    }
  };

  const confirmDelete = (scanId) => setConfirmDeleteId(scanId);

  const deleteScan = async () => {
    const scanId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      setDeleting(scanId);
      await axios.delete(`/api/scans/${scanId}`);
      setScans((prev) => prev.filter((s) => s._id !== scanId));
      toast({ type: 'success', message: 'Scan deleted.' });
    } catch (e) {
      toast({ type: 'error', message: 'Failed to delete scan.' });
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

      {!loading && !hasScans ? (
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
            <thead className="sticky top-0 z-10 bg-dark-200 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Report</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <SkeletonRows />
              ) : (
                scans.map((s) => (
                  <ScanRow
                    key={s._id}
                    scan={s}
                    onDownload={downloadReport}
                    isDownloading={isDownloading}
                    onDelete={confirmDelete}
                    isDeleting={deleting === s._id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Styled delete confirmation modal */}
      <Modal
        open={Boolean(confirmDeleteId)}
        title="Delete scan"
        onClose={() => setConfirmDeleteId(null)}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-gray-400 hover:bg-black/5 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteScan}
              className="px-4 py-2 text-sm rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition font-semibold"
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-400">
          This scan and all its results will be permanently removed. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function CopyUrlButton({ text }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied!' : 'Copy URL'}
      className="ml-1 inline-flex items-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition text-gray-500 hover:text-gray-300"
      aria-label="Copy URL"
    >
      {copied ? (
        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
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

  const relativeTime = timeAgo(startedAt);
  const absoluteTime = formatLocalDateTime(startedAt, null, 'Queued');

  return (
    <tr className="hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors duration-150 group">
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-1">
          <span className="font-medium text-white truncate max-w-xs" title={host}>{host}</span>
          <CopyUrlButton text={targetUrl} />
        </div>
        <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs" title={targetUrl}>{targetUrl}</div>
        <div className="text-xs text-gray-600 mt-1" title={absoluteTime}>
          {relativeTime ?? absoluteTime}
        </div>
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