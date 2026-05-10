import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { Card } from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { displayFindingTitle } from '../utils/findingTitle.js';
import { getSeverityRank, SEVERITY_COLORS, SEVERITY_ORDER } from '../utils/severity.js';
import { formatLocalDateTime, timeAgo } from '../utils/dates.js';
import { targetLabel } from '../utils/targetLabel.js';
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function isRealFinding(finding) {
  if (!finding || !finding.title) return false;
  const title = String(finding.title).toLowerCase();
  const category = String(finding.category || '').toLowerCase();
  if (category === 'network' || category === 'policy' || category === 'http' || category === 'coverage') return false;
  if (title.includes('scan error') || title.endsWith('enumeration error')) return false;
  if (title === 'dns resolution failed' || title === 'invalid site url') return false;
  if (title.includes('timeout') || title.includes('timed out') || title.includes('could not') || title.includes('unable to')) return false;
  return true;
}

function getTargetLabel(scan) {
  if (!scan) return '';
  return targetLabel(scan.targetUrl, scan.targetHost);
}

export default function Dashboard() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalScans: 0, openScans: 0, success: 0, failed: 0 });
  const [vulnCounts, setVulnCounts] = useState({ low: 0, medium: 0, high: 0, critical: 0, info: 0 });
  const [recentScans, setRecentScans] = useState([]);
  const [topIssues, setTopIssues] = useState([]);
  const [barScans, setBarScans] = useState([]);
  const [queuedScans, setQueuedScans] = useState([]);

  const fetchData = async () => {
    try {
      const { data } = await axios.get('/api/scans');
      const total = data.length;
      const open = data.filter((s) => ['queued', 'running'].includes(s.status)).length;
      const success = data.filter((s) => s.status === 'completed').length;
      const failed = data.filter((s) => s.status === 'failed').length;
      const counts = { low: 0, medium: 0, high: 0, critical: 0, info: 0 };
      const issueAgg = {};
      data.slice(0, 10).forEach((scan) => {
        (scan.results || []).filter(isRealFinding).forEach((finding) => {
          const sev = String(finding.severity || 'info').toLowerCase();
          if (counts[sev] !== undefined) counts[sev] += 1;
          const title = String(finding.title || '');
          if (!issueAgg[title]) issueAgg[title] = { title, count: 0, maxSeverity: 'info' };
          issueAgg[title].count += 1;
          if (getSeverityRank(sev) > getSeverityRank(issueAgg[title].maxSeverity)) issueAgg[title].maxSeverity = sev;
        });
      });
      const sortedIssues = Object.values(issueAgg).sort((a, b) => (b.count - a.count) || (getSeverityRank(b.maxSeverity) - getSeverityRank(a.maxSeverity)) || a.title.localeCompare(b.title)).slice(0, 5);
      setMetrics({ totalScans: total, openScans: open, success, failed });
      setVulnCounts(counts);
      setRecentScans(data.slice(0, 5));
      setTopIssues(sortedIssues);
      setBarScans(data.filter((s) => s.status === 'completed').slice(0, 6).reverse());
      setQueuedScans(data.filter((s) => ['queued', 'scheduled'].includes(s.status)));
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => { try { const msg = JSON.parse(e.data); if (['progress', 'completed', 'failed'].includes(msg.type)) fetchData(); } catch { } };
    return () => es.close();
  }, []);

  const axisText = theme === 'dark' ? '#4b5563' : 'rgba(15,23,42,0.45)';
  const legendText = theme === 'dark' ? '#6b7280' : 'rgba(15,23,42,0.50)';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';
  const barLabels = barScans.map((s) => getTargetLabel(s) || s._id?.slice(-6));

  const barData = useMemo(() => ({
    labels: barLabels.length ? barLabels : ['No data yet'],
    datasets: SEVERITY_ORDER.map((sev) => ({
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      backgroundColor: SEVERITY_COLORS[sev],
      borderRadius: 4,
      data: barScans.length ? barScans.map((scan) => (scan.results || []).filter(isRealFinding).filter((f) => String(f.severity || 'info').toLowerCase() === sev).length) : [0],
    })),
  }), [barLabels.join('|'), barScans]);

  const barOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: legendText, boxWidth: 10, padding: 16 } } },
    scales: {
      x: { ticks: { color: axisText, font: { size: 11 } }, grid: { color: gridColor } },
      y: { beginAtZero: true, ticks: { color: axisText, precision: 0, font: { size: 11 } }, grid: { color: gridColor } },
    },
  }), [axisText, legendText, gridColor]);

  const doughnutTotal = Object.values(vulnCounts).reduce((a, b) => a + b, 0);
  const doughnutData = useMemo(() => ({
    labels: ['Low', 'Medium', 'High', 'Critical', 'Info'],
    datasets: [{ data: [vulnCounts.low, vulnCounts.medium, vulnCounts.high, vulnCounts.critical, vulnCounts.info], backgroundColor: [SEVERITY_COLORS.low, SEVERITY_COLORS.medium, SEVERITY_COLORS.high, SEVERITY_COLORS.critical, SEVERITY_COLORS.info], borderWidth: 2, borderColor: theme === 'dark' ? '#08080c' : '#f3f6fb' }],
  }), [vulnCounts, theme]);

  const doughnutOptions = useMemo(() => ({ cutout: '68%', responsive: true, plugins: { legend: { position: 'bottom', labels: { color: legendText, boxWidth: 10, padding: 10 } } } }), [legendText]);

  const centreTextPlugin = useMemo(() => ({
    id: 'centreText',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = "bold 22px 'JetBrains Mono', monospace";
      ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(doughnutTotal, cx, cy - 8);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillStyle = axisText;
      ctx.fillText('findings', cx, cy + 12);
      ctx.restore();
    },
  }), [theme, doughnutTotal, axisText]);

  const recentFindings = useMemo(() =>
    recentScans.flatMap((scan) => (scan.results || []).filter(isRealFinding).slice(0, 3).map((f) => ({ ...f, scanId: scan._id, scanTarget: getTargetLabel(scan), scanCreatedAt: scan.createdAt }))).slice(0, 8),
    [recentScans]);

  const METRIC_CONFIGS = [
    { label: 'Total scans', value: metrics.totalScans, color: 'text-blue-400' },
    { label: 'Active', value: metrics.openScans, color: 'text-amber-400' },
    { label: 'Completed', value: metrics.success, color: 'text-emerald-400' },
    { label: 'Failed', value: metrics.failed, color: 'text-red-400' },
  ];

  const CardTitle = ({ color, children, sub }) => (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-[3px] h-4 rounded-full ${color} shrink-0`} />
      <div><h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200">{children}</h3>{sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}</div>
    </div>
  );

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:bg-gradient-to-r dark:from-primary-400 dark:to-secondary-400 dark:bg-clip-text dark:text-transparent">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Here's what's happening across your scans.</p>
      </div>

      {/* Stats strip */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-200 shadow-soft">
        {loading ? (
          <div className="flex divide-x divide-slate-200 dark:divide-slate-800">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 px-6 py-5">
                <div className="skeleton h-3 w-16 mb-3" />
                <div className="skeleton h-8 w-10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex divide-x divide-slate-200 dark:divide-slate-800">
            {METRIC_CONFIGS.map(({ label, value, color }) => (
              <div key={label} className="flex-1 px-6 py-5 min-w-0">
                <p className="text-xs text-gray-500 mb-1.5">{label}</p>
                <p className={`text-3xl font-bold font-mono tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <Card className="p-5" variant="accent" accentColor="border-t-primary-500/50">
          <div className="flex items-start justify-between gap-4 mb-4"><CardTitle color="bg-primary-500">Findings per scan</CardTitle></div>
          {loading ? <div className="h-48 flex flex-col justify-end gap-2 px-2">{[60, 80, 45, 90, 55, 70].map((h, i) => <div key={i} className="skeleton rounded" style={{ height: `${h}%`, maxHeight: '2rem' }} />)}</div>
            : barScans.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No completed scans yet.</div>
              : <Bar data={barData} options={barOptions} />}
        </Card>

        <Card className="p-5 flex flex-col items-center min-w-[240px]" variant="accent" accentColor="border-t-violet-500/50">
          <div className="w-full"><CardTitle color="bg-violet-500" sub="Across the last 10 scans.">Severity breakdown</CardTitle></div>
          {loading ? <div className="w-44 h-44 mt-4"><div className="skeleton w-full h-full rounded-full" /></div>
            : <div className="w-44 h-44 mt-4"><Doughnut data={doughnutData} options={doughnutOptions} plugins={[centreTextPlugin]} /></div>}
        </Card>
      </div>

      {(loading || queuedScans.length > 0) && (
        <Card className="p-5" variant="accent" accentColor="border-t-amber-500/50">
          <div className="flex items-start justify-between gap-3 mb-4">
            <CardTitle color="bg-amber-500" sub={loading ? '' : `${queuedScans.length} scan${queuedScans.length !== 1 ? 's' : ''} waiting to run.`}>Queued</CardTitle>
            <Link to="/scans" className="view-all-link text-xs font-semibold text-primary-400 hover:text-primary-300 transition">View all <span aria-hidden>→</span></Link>
          </div>
          {loading ? <ul className="divide-y divide-slate-200 dark:divide-slate-800">{[1, 2].map((i) => <li key={i} className="py-2.5 flex items-center justify-between gap-3"><div className="skeleton h-4 w-40" /><div className="skeleton h-5 w-16 rounded-full" /></li>)}</ul>
            : <ul className="divide-y divide-white/5">{queuedScans.map((scan) => {
              const label = getTargetLabel(scan) || scan._id?.slice(-6);
              const isScheduled = scan.status === 'scheduled';
              return (
                <li key={scan._id} className="py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors px-1 rounded-lg">
                  <div className="min-w-0"><p className="text-sm text-slate-800 dark:text-gray-200 truncate font-mono" title={label}>{label}</p>{isScheduled && scan.scheduledFor && <p className="text-xs text-gray-500 mt-0.5">Runs {formatLocalDateTime(scan.scheduledFor, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}</div>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border shrink-0 ${isScheduled ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>{scan.status}</span>
                </li>
              );
            })}</ul>}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5" variant="accent" accentColor="border-t-red-500/50">
          <div className="flex items-start justify-between gap-3 mb-4">
            <CardTitle color="bg-red-500" sub="Recurring across your last 10 scans.">Top issues</CardTitle>
            <Link to="/scans" className="view-all-link text-xs font-semibold text-primary-400 hover:text-primary-300 transition">View scans <span aria-hidden>→</span></Link>
          </div>
          {loading ? <ul className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <li key={i} className="flex items-center justify-between gap-3"><div className="skeleton h-4 flex-1 max-w-[180px]" /><div className="flex gap-2"><div className="skeleton h-5 w-14 rounded-full" /><div className="skeleton h-5 w-8 rounded-full" /></div></li>)}</ul>
            : topIssues.length === 0 ? <EmptyState title="No findings yet" description="Complete a scan to see the most common issues here." />
              : <ul className="space-y-2">{topIssues.map((issue) => {
                const sev = String(issue.maxSeverity || 'info').toLowerCase();
                const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.info;
                const title = displayFindingTitle(issue.title);
                return (
                  <li key={issue.title} className="flex items-center justify-between gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors px-1 py-0.5 rounded-lg">
                    <span className="text-sm text-slate-700 dark:text-gray-300 truncate" title={title}>{title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border" style={{ backgroundColor: color + '18', color, borderColor: color + '35' }}>{sev}</span>
                      <span className="text-xs bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/8 text-gray-500 px-2 py-0.5 rounded-full font-mono">×{issue.count}</span>
                    </span>
                  </li>
                );
              })}</ul>}
        </Card>

        <Card className="p-5" variant="accent" accentColor="border-t-teal-500/50">
          <div className="flex items-start justify-between gap-3 mb-4">
            <CardTitle color="bg-teal-500" sub="What the scanner found, most recently.">Recent findings</CardTitle>
            <Link to="/changes" className="view-all-link text-xs font-semibold text-primary-400 hover:text-primary-300 transition">View changes <span aria-hidden>→</span></Link>
          </div>
          {loading ? <ul className="divide-y divide-slate-800">{[1, 2, 3, 4].map((i) => <li key={i} className="py-2.5 flex items-start justify-between gap-3"><div><div className="skeleton h-4 w-40 mb-2" /><div className="skeleton h-3 w-28" /></div><div className="skeleton h-5 w-14 rounded-full shrink-0" /></li>)}</ul>
            : recentFindings.length === 0 ? <EmptyState title="No findings yet" description="Start a scan to see results here." />
              : <ul className="divide-y divide-white/5">{recentFindings.map((finding, idx) => {
                const sev = String(finding.severity || 'info').toLowerCase();
                const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.info;
                const title = displayFindingTitle(finding);
                const relativeTime = timeAgo(finding.scanCreatedAt);
                const absoluteTime = formatLocalDateTime(finding.scanCreatedAt, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                return (
                  <li key={`${finding.scanId}:${idx}`} className="py-2.5 flex items-start justify-between gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors px-1 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 dark:text-gray-200 truncate" title={title}>{title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5 font-mono" title={absoluteTime}>{finding.scanTarget} · {relativeTime ?? absoluteTime}</p>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: color + '22', color }}>{sev}</span>
                      <Link to={`/report/${finding.scanId}`} className="view-all-link text-xs font-semibold text-primary-400 hover:text-primary-300 transition">View <span aria-hidden>→</span></Link>
                    </span>
                  </li>
                );
              })}</ul>}
        </Card>
      </div>
    </div>
  );
}
