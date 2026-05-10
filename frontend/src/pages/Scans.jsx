import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import AnimatedProgressBar from '../components/ui/AnimatedProgressBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import SeverityMiniBar from '../components/ui/SeverityMiniBar.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { formatLocalDateTime, timeAgo } from '../utils/dates.js';
import { targetLabel } from '../utils/targetLabel.js';

const STATUS_CONFIG = {
  completed: { style: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', strip: 'bg-emerald-500', icon: <CheckDot /> },
  running:   { style: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',     strip: 'bg-blue-500',    icon: <PulseDot color="bg-blue-400" /> },
  queued:    { style: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',   strip: 'bg-amber-500',   icon: <ClockDot /> },
  failed:    { style: 'bg-red-500/15 text-red-400 border border-red-500/30',         strip: 'bg-red-500',     icon: <XDot /> },
  scheduled: { style: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',strip: 'bg-violet-500',  icon: <CalDot /> },
};

function PulseDot({ color = 'bg-blue-400' }) { return <span className={`w-1.5 h-1.5 rounded-full ${color} animate-pulse inline-block`} />; }
function CheckDot() { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>; }
function ClockDot() { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function XDot()    { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>; }
function CalDot()  { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>; }
function GlobeIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>; }
function DownloadIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>; }
function TrashIcon()  { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }

export default function Scans() {
  const toast = useToast();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = async () => {
    try { const { data } = await axios.get('/api/scans'); setScans(data); }
    catch {} finally { setLoading(false); }
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
          if (type === 'progress') { scan.progress = progress ?? scan.progress; if (scan.status !== 'completed') scan.status = 'running'; }
          else if (type === 'completed') { scan.status = 'completed'; scan.progress = 100; }
          else if (type === 'failed') { if (scan.status !== 'completed') scan.status = 'failed'; }
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
      if (data?.url) { window.open(data.url, '_blank', 'noopener'); toast({ type: 'success', message: `${type.toUpperCase()} report ready.` }); }
    } catch (e) {
      toast({ type: 'error', message: `Failed to generate ${type.toUpperCase()} report.` });
    } finally { setDownloading(null); }
  };

  const deleteScan = async () => {
    const scanId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      setDeleting(scanId);
      await axios.delete(`/api/scans/${scanId}`);
      setScans((prev) => prev.filter((s) => s._id !== scanId));
      toast({ type: 'success', message: 'Scan deleted.' });
    } catch { toast({ type: 'error', message: 'Failed to delete scan.' }); }
    finally { setDeleting(null); }
  };

  const isDownloading = (scanId, type) => downloading?.scanId === scanId && downloading?.type === type;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:bg-gradient-to-r dark:from-primary-400 dark:to-secondary-400 dark:bg-clip-text dark:text-transparent">Scans</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{scans.length} scan{scans.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link to="/new" className="btn btn-primary text-sm px-5 py-2 rounded-full shrink-0">+ New scan</Link>
      </div>

      {!loading && scans.length === 0 ? (
        <EmptyState
          title="No scans yet"
          description="Create a scan to start tracking changes over time."
          action={<Link to="/new" className="btn btn-primary text-sm px-5 py-2 rounded-full">Start your first scan</Link>}
        />
      ) : (
        <ul className="space-y-3 cards-stagger">
          {loading ? [1,2,3].map((i) => (
            <li key={i} className="rounded-xl border border-slate-800 bg-dark-200 p-4 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0"><div className="skeleton h-4 w-40 mb-2" /><div className="skeleton h-3 w-56" /></div>
              <div className="skeleton h-6 w-20 rounded-full shrink-0" />
            </li>
          )) : scans.map((s) => (
            <ScanCard
              key={s._id}
              scan={s}
              onDownload={downloadReport}
              isDownloading={isDownloading}
              onDelete={(id) => setConfirmDeleteId(id)}
              isDeleting={deleting === s._id}
            />
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(confirmDeleteId)}
        title="Delete scan"
        onClose={() => setConfirmDeleteId(null)}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm rounded-full border border-slate-700 text-gray-400 hover:bg-white/5 transition">Cancel</button>
            <button type="button" onClick={deleteScan} className="px-4 py-2 text-sm rounded-full bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition font-semibold">Delete</button>
          </div>
        }
      >
        <p className="text-sm text-gray-400">This scan and all its results will be permanently removed. This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function CopyUrlButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  return (
    <button type="button" onClick={copy} title={copied ? 'Copied!' : 'Copy URL'} className="ml-1 inline-flex items-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition text-gray-500 hover:text-gray-300" aria-label="Copy URL">
      {copied ? <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
    </button>
  );
}

function ScanCard({ scan, onDownload, isDownloading, onDelete, isDeleting }) {
  const { _id, targetUrl, targetHost, status, progress, startedAt, results, diffSummary } = scan;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const pct = Math.min(100, Math.max(0, progress ?? 0));
  const running = ['running', 'queued', 'scheduled'].includes(status);
  const newHighCritical = diffSummary?.newBlockedCount ?? 0;

  const host = useMemo(() => {
    return targetLabel(targetUrl, targetHost);
  }, [targetHost, targetUrl]);

  const relativeTime = timeAgo(startedAt);
  const absoluteTime = formatLocalDateTime(startedAt, null, 'Queued');

  return (
    <li className={`group relative card-hover rounded-xl border border-gray-200 dark:border-slate-800 bg-white/60 dark:bg-dark-200 overflow-hidden flex items-stretch`}>

      <div className="flex-1 pl-5 pr-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        {/* Domain */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/8 flex items-center justify-center text-slate-500 dark:text-gray-500 shrink-0">
            <GlobeIcon />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-slate-800 dark:text-white truncate max-w-xs text-sm" title={host}>{host}</span>
              <CopyUrlButton text={targetUrl} />
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-600 mt-0.5 truncate max-w-xs font-mono" title={targetUrl}>{targetUrl}</div>
            <div className="text-xs text-slate-500 dark:text-gray-600 mt-0.5 font-mono" title={absoluteTime}>{relativeTime ?? absoluteTime}</div>
            {status === 'completed' && <div className="mt-2"><SeverityMiniBar findings={results || []} /></div>}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.style}`}>
            {cfg.icon}{status}
          </span>
          {newHighCritical > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
              ⚠ {newHighCritical} new critical
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 w-40 shrink-0">
          <div className="flex-1"><AnimatedProgressBar progress={pct} running={running} compact /></div>
          <span className="text-xs text-gray-500 w-8 text-right tabular-nums font-mono">{pct}%</span>
        </div>

        {/* Report links */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {status === 'completed' ? (
            <>
              <Link to={`/report/${_id}`} className="font-semibold text-primary-400 hover:text-primary-300 transition link-underline">View</Link>
              <button
                type="button"
                onClick={() => onDownload(_id, 'pdf')}
                disabled={isDownloading(_id, 'pdf')}
                aria-busy={isDownloading(_id, 'pdf')}
                className="text-gray-500 hover:text-white transition disabled:opacity-40 font-mono inline-flex items-center gap-1.5"
              >
                {isDownloading(_id, 'pdf') ? <Spinner size="xs" className="text-current" /> : null}
                <span>PDF</span>
              </button>
              <span className="text-white/20">·</span>
              <button
                type="button"
                onClick={() => onDownload(_id, 'csv')}
                disabled={isDownloading(_id, 'csv')}
                aria-busy={isDownloading(_id, 'csv')}
                className="text-gray-500 hover:text-white transition disabled:opacity-40 font-mono inline-flex items-center gap-1.5"
              >
                {isDownloading(_id, 'csv') ? <Spinner size="xs" className="text-current" /> : null}
                <span>CSV</span>
              </button>
            </>
          ) : status === 'running' ? (
            <Link to={`/report/${_id}`} className="font-semibold text-primary-400 hover:text-primary-300 transition link-underline">Live view</Link>
          ) : status === 'queued' || status === 'scheduled' ? (
            <>
              <Link to={`/report/${_id}`} className="font-semibold text-primary-400 hover:text-primary-300 transition link-underline">View</Link>
              <span className="text-white/20">·</span>
              <Link to={`/new?edit=${_id}`} className="text-gray-500 hover:text-white transition link-underline">Edit modules</Link>
            </>
          ) : (
            <Link to={`/report/${_id}`} className="font-semibold text-gray-500 hover:text-gray-300 transition link-underline">View</Link>
          )}
        </div>
      </div>

      {/* Delete action — appears on hover */}
      <div className="flex items-center pr-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onDelete(_id)}
          disabled={isDeleting || status === 'running'}
          className="p-2 rounded-full text-red-500/50 hover:text-red-400 hover:bg-red-900/10 transition disabled:opacity-30"
          title="Delete scan"
        >
          {isDeleting ? <span className="text-xs font-mono">…</span> : <TrashIcon />}
        </button>
      </div>
    </li>
  );
}