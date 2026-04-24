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
import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function isRealFinding(finding) {
  if (!finding || !finding.title) return false;

  const title = String(finding.title).toLowerCase();
  const category = String(finding.category || '').toLowerCase();

  // Exclude non-security “scanner could not run” conditions.
  if (category === 'network' || category === 'policy' || category === 'http') return false;

  // Exclude module failures without accidentally hiding real findings like
  // "Verbose error or stack trace exposed".
  if (title.includes('scan error') || title.endsWith('enumeration error')) return false;

  if (title === 'dns resolution failed' || title === 'invalid site url') return false;

  if (title.includes('timeout') || title.includes('timed out') || title.includes('could not') || title.includes('unable to')) {
    return false;
  }

  return true;
}

function getTargetLabel(scan) {
  if (!scan) return '';

  if (scan.targetHost) return scan.targetHost;

  try {
    return new URL(scan.targetUrl).hostname;
  } catch {
    return scan.targetUrl || '';
  }
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
      const open = data.filter((scan) => ['queued', 'running'].includes(scan.status)).length;
      const success = data.filter((scan) => scan.status === 'completed').length;
      const failed = data.filter((scan) => scan.status === 'failed').length;

      const counts = { low: 0, medium: 0, high: 0, critical: 0, info: 0 };
      const issueAgg = {};

      data.slice(0, 10).forEach((scan) => {
        (scan.results || []).filter(isRealFinding).forEach((finding) => {
          const sev = String(finding.severity || 'info').toLowerCase();
          if (counts[sev] !== undefined) counts[sev] += 1;

          const title = String(finding.title || '');
          if (!issueAgg[title]) {
            issueAgg[title] = { title, count: 0, maxSeverity: 'info' };
          }
          issueAgg[title].count += 1;
          if (getSeverityRank(sev) > getSeverityRank(issueAgg[title].maxSeverity)) {
            issueAgg[title].maxSeverity = sev;
          }
        });
      });

      const sortedIssues = Object.values(issueAgg)
        .sort((a, b) => (b.count - a.count) || (getSeverityRank(b.maxSeverity) - getSeverityRank(a.maxSeverity)) || a.title.localeCompare(b.title))
        .slice(0, 5);

      const completed = data.filter((scan) => scan.status === 'completed').slice(0, 6).reverse();
      const pending = data.filter((scan) => ['queued', 'scheduled'].includes(scan.status));

      setMetrics({ totalScans: total, openScans: open, success, failed });
      setVulnCounts(counts);
      setRecentScans(data.slice(0, 5));
      setTopIssues(sortedIssues);
      setBarScans(completed);
      setQueuedScans(pending);
    } catch {
      // ignore — backend may not be running
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (['progress', 'completed', 'failed'].includes(msg.type)) fetchData();
      } catch {}
    };

    return () => es.close();
  }, []);

  const axisText = theme === 'dark' ? '#6b7280' : 'rgba(15, 23, 42, 0.55)';
  const legendText = theme === 'dark' ? '#9ca3af' : 'rgba(15, 23, 42, 0.55)';
  const gridColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.10)';

  const barLabels = barScans.map((scan) => getTargetLabel(scan) || scan._id?.slice(-6));

  const barData = useMemo(() => ({
    labels: barLabels.length ? barLabels : ['No data yet'],
    datasets: SEVERITY_ORDER.map((sev) => ({
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      backgroundColor: SEVERITY_COLORS[sev],
      data: barScans.length
        ? barScans.map((scan) =>
            (scan.results || [])
              .filter(isRealFinding)
              .filter((finding) => String(finding.severity || 'info').toLowerCase() === sev).length,
          )
        : [0],
    })),
  }), [barLabels.join('|'), barScans]);

  const barOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: legendText, boxWidth: 12, padding: 16 } } },
    scales: {
      x: { ticks: { color: axisText }, grid: { color: gridColor } },
      y: { beginAtZero: true, ticks: { color: axisText, precision: 0 }, grid: { color: gridColor } },
    },
  }), [axisText, legendText, gridColor]);

  const doughnutTotal = Object.values(vulnCounts).reduce((a, b) => a + b, 0);

  const doughnutData = useMemo(() => ({
    labels: ['Low', 'Medium', 'High', 'Critical', 'Info'],
    datasets: [{
      data: [vulnCounts.low, vulnCounts.medium, vulnCounts.high, vulnCounts.critical, vulnCounts.info],
      backgroundColor: [SEVERITY_COLORS.low, SEVERITY_COLORS.medium, SEVERITY_COLORS.high, SEVERITY_COLORS.critical, SEVERITY_COLORS.info],
      borderWidth: 2,
      borderColor: '#111827',
    }],
  }), [vulnCounts]);

  const doughnutOptions = useMemo(() => ({
    cutout: '65%',
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: legendText, boxWidth: 12, padding: 12 } } },
  }), [legendText]);

  const centreTextPlugin = useMemo(() => ({
    id: 'centreText',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = theme === 'dark' ? '#f9fafb' : '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(doughnutTotal, cx, cy - 8);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = axisText;
      ctx.fillText('findings', cx, cy + 12);
      ctx.restore();
    },
  }), [theme, doughnutTotal, axisText]);

  const recentFindings = useMemo(() =>
    recentScans
      .flatMap((scan) =>
        (scan.results || [])
          .filter(isRealFinding)
          .slice(0, 3)
          .map((finding) => ({
            ...finding,
            scanId: scan._id,
            scanTarget: getTargetLabel(scan),
            scanCreatedAt: scan.createdAt,
          })),
      )
      .slice(0, 8),
  [recentScans]);

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">A quick summary of your latest scans.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-dark-200 p-4 flex items-center gap-4 shadow-soft">
              <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="skeleton h-3 w-16 mb-2" />
                <div className="skeleton h-7 w-10" />
              </div>
            </div>
          ))
        ) : (
          <>
            <MetricCard label="Total scans" value={metrics.totalScans} color="text-blue-400" icon={<ScanIcon />} />
            <MetricCard label="Active" value={metrics.openScans} color="text-amber-400" icon={<SpinnerIcon />} />
            <MetricCard label="Completed" value={metrics.success} color="text-emerald-400" icon={<CheckIcon />} />
            <MetricCard label="Failed" value={metrics.failed} color="text-red-400" icon={<XIcon />} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Findings per scan</h3>
              <p className="text-xs text-gray-600 mt-1">Severity totals across your latest completed scans.</p>
            </div>
          </div>
          {loading ? (
            <div className="h-48 flex flex-col justify-end gap-2 px-2">
              {/* Varied heights give visual diversity to the skeleton bar chart placeholder */}
              {[60, 80, 45, 90, 55, 70].map((h, i) => (
                <div key={i} className="skeleton rounded" style={{ height: `${h}%`, maxHeight: '2rem' }} />
              ))}
            </div>
          ) : barScans.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              No completed scans yet.
            </div>
          ) : (
            <Bar data={barData} options={barOptions} />
          )}
        </Card>

        <Card className="p-5 flex flex-col items-center min-w-[240px]">
          <div className="w-full">
            <h3 className="text-sm font-semibold text-gray-200">Severity breakdown</h3>
            <p className="text-xs text-gray-600 mt-1">Across the last 10 scans.</p>
          </div>
          {loading ? (
            <div className="w-44 h-44 mt-4 flex items-center justify-center">
              <div className="skeleton w-full h-full rounded-full" />
            </div>
          ) : (
            <div className="w-44 h-44 mt-4">
              <Doughnut data={doughnutData} options={doughnutOptions} plugins={[centreTextPlugin]} />
            </div>
          )}
        </Card>
      </div>

      {(loading || queuedScans.length > 0) && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Queued</h3>
              <p className="text-xs text-gray-600 mt-1">
                {loading ? (
                  <span className="skeleton inline-block h-3 w-32" />
                ) : `${queuedScans.length} scan${queuedScans.length !== 1 ? 's' : ''} waiting to run.`}
              </p>
            </div>
            <Link to="/scans" className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition">
              View all →
            </Link>
          </div>

          {loading ? (
            <ul className="divide-y divide-slate-800">
              {[1, 2].map((i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-slate-800">
              {queuedScans.map((scan) => {
                const label = getTargetLabel(scan) || scan._id?.slice(-6);
                const isScheduled = scan.status === 'scheduled';
                return (
                  <li key={scan._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate" title={label}>{label}</p>
                      {isScheduled && scan.scheduledFor && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          Runs {formatLocalDateTime(scan.scheduledFor, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border shrink-0 ${
                      isScheduled
                        ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>
                      {scan.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Top issues</h3>
              <p className="text-xs text-gray-600 mt-1">Most common findings from recent scans.</p>
            </div>
            <Link to="/scans" className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition">
              View scans →
            </Link>
          </div>

          {loading ? (
            <ul className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <div className="skeleton h-4 flex-1 max-w-[180px]" />
                  <div className="flex items-center gap-2">
                    <div className="skeleton h-5 w-14 rounded-full" />
                    <div className="skeleton h-5 w-8 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          ) : topIssues.length === 0 ? (
            <EmptyState title="No findings yet" description="Complete a scan to see the most common issues here." />
          ) : (
            <ul className="space-y-2">
              {topIssues.map((issue) => {
                const sev = String(issue.maxSeverity || 'info').toLowerCase();
                const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.info;
                const title = displayFindingTitle(issue.title);

                return (
                  <li key={issue.title} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-300 truncate" title={title}>
                      {title}
                    </span>

                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
                        style={{ backgroundColor: color + '15', color, borderColor: color + '40' }}
                      >
                        {sev}
                      </span>
                      <span className="text-xs bg-black/5 dark:bg-slate-700/60 border border-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-mono">
                        ×{issue.count}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Recent findings</h3>
              <p className="text-xs text-gray-600 mt-1">A quick look at the latest results.</p>
            </div>
            <Link to="/changes" className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition">
              View changes →
            </Link>
          </div>

          {loading ? (
            <ul className="divide-y divide-slate-800">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="skeleton h-4 w-40 mb-2" />
                    <div className="skeleton h-3 w-28" />
                  </div>
                  <div className="skeleton h-5 w-14 rounded-full shrink-0" />
                </li>
              ))}
            </ul>
          ) : recentFindings.length === 0 ? (
            <EmptyState title="No findings yet" description="Start a scan to see results here." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentFindings.map((finding, idx) => {
                const sev = String(finding.severity || 'info').toLowerCase();
                const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.info;
                const title = displayFindingTitle(finding);
                const relativeTime = timeAgo(finding.scanCreatedAt);
                const absoluteTime = formatLocalDateTime(finding.scanCreatedAt, {
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <li key={`${finding.scanId}:${idx}`} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate" title={title}>{title}</p>
                      <p className="text-xs text-gray-600 truncate mt-0.5" title={absoluteTime}>
                        {finding.scanTarget} • {relativeTime ?? absoluteTime}
                      </p>
                    </div>

                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: color + '25', color }}
                      >
                        {sev}
                      </span>
                      <Link
                        to={`/report/${finding.scanId}`}
                        className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition"
                      >
                        View →
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, icon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-dark-200 p-4 flex items-center gap-4 shadow-soft">
      <div className={`w-10 h-10 rounded-lg bg-black/5 dark:bg-slate-800 flex items-center justify-center ${color} shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
