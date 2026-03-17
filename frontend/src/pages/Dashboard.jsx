import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { Card } from '../components/ui/Card.jsx';
import { displayFindingTitle } from '../utils/findingTitle.js';
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

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_COLORS = {
  critical: '#7c3aed',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#14b8a6',
  info: '#6b7280',
};

const HEADER_HINTS = {
  'X-Frame-Options': 'clickjacking protection',
  'X-Content-Type-Options': 'MIME sniffing protection',
  'Referrer-Policy': 'referrer privacy',
  'Strict-Transport-Security': 'HTTPS enforcement',
  'Content-Security-Policy': 'content restrictions',
};

function displayFindingTitle(title) {
  const raw = String(title || '');
  const match = raw.match(/^Missing security header:\s*(.+)$/i);
  if (!match) return raw;

  const header = match[1].trim();
  const label = HEADER_HINTS[header];
  if (label) return `Missing ${label} header (${header})`;

  return `Missing browser security header (${header})`;
}

function isRealFinding(finding) {
  if (!finding || !finding.title) return false;
  const title = finding.title.toLowerCase();
  return !(
    title.includes('error') ||
    title.includes('exception') ||
    title.includes('failed') ||
    title.includes('timeout') ||
    title.includes('could not') ||
    title.includes('unable to')
  );
}

function severityRank(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical') return 4;
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
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

function formatLocalDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default function Dashboard() {
  const { theme } = useTheme();
  const [metrics, setMetrics] = useState({ totalScans: 0, openScans: 0, success: 0, failed: 0 });
  const [vulnCounts, setVulnCounts] = useState({ low: 0, medium: 0, high: 0, critical: 0, info: 0 });
  const [recentScans, setRecentScans] = useState([]);
  const [topIssues, setTopIssues] = useState([]);
  const [barScans, setBarScans] = useState([]);

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
          if (severityRank(sev) > severityRank(issueAgg[title].maxSeverity)) {
            issueAgg[title].maxSeverity = sev;
          }
        });
      });

      const sortedIssues = Object.values(issueAgg)
        .sort((a, b) => (b.count - a.count) || (severityRank(b.maxSeverity) - severityRank(a.maxSeverity)) || a.title.localeCompare(b.title))
        .slice(0, 5);

      const completed = data.filter((scan) => scan.status === 'completed').slice(0, 6).reverse();

      setMetrics({ totalScans: total, openScans: open, success, failed });
      setVulnCounts(counts);
      setRecentScans(data.slice(0, 5));
      setTopIssues(sortedIssues);
      setBarScans(completed);
    } catch {
      // ignore — backend may not be running
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
    datasets: SEV_ORDER.map((sev) => ({
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      backgroundColor: SEV_COLORS[sev],
      data: barScans.length
        ? barScans.map((scan) =>
            (scan.results || []).filter(isRealFinding).filter(
              (finding) => String(finding.severity || 'info').toLowerCase() === sev,
            ).length,
          )
        : [0],
    })),
  }), [barLabels.join('|'), barScans]);

  const barOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: legendText, boxWidth: 12, padding: 16 } } },
    scales: {
      x: { stacked: false, ticks: { color: axisText }, grid: { color: gridColor } },
      y: { beginAtZero: true, ticks: { color: axisText, precision: 0 }, grid: { color: gridColor } },
    },
  }), [axisText, legendText, gridColor]);

  const doughnutTotal = Object.values(vulnCounts).reduce((a, b) => a + b, 0);

  const doughnutData = useMemo(() => ({
    labels: ['Low', 'Medium', 'High', 'Critical', 'Info'],
    datasets: [{
      data: [vulnCounts.low, vulnCounts.medium, vulnCounts.high, vulnCounts.critical, vulnCounts.info],
      backgroundColor: [SEV_COLORS.low, SEV_COLORS.medium, SEV_COLORS.high, SEV_COLORS.critical, SEV_COLORS.info],
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
        <MetricCard label="Total scans" value={metrics.totalScans} color="text-blue-400" icon={<ScanIcon />} />
        <MetricCard label="Running" value={metrics.openScans} color="text-amber-400" icon={<SpinnerIcon />} />
        <MetricCard label="Completed" value={metrics.success} color="text-emerald-400" icon={<CheckIcon />} />
        <MetricCard label="Failed" value={metrics.failed} color="text-red-400" icon={<XIcon />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Findings per scan</h3>
              <p className="text-xs text-gray-600 mt-1">Severity totals across your latest completed scans.</p>
            </div>
          </div>
          {barScans.length === 0 ? (
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
          <div className="w-44 h-44 mt-4">
            <Doughnut data={doughnutData} options={doughnutOptions} plugins={[centreTextPlugin]} />
          </div>
        </Card>
      </div>

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

          {topIssues.length === 0 ? (
            <p className="text-sm text-gray-600">No findings yet.</p>
          ) : (
            <ul className="space-y-2">
              {topIssues.map((issue) => {
                const sev = String(issue.maxSeverity || 'info').toLowerCase();
                const color = SEV_COLORS[sev] || SEV_COLORS.info;

                return (
                  <li key={issue.title} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-300 truncate">
                      {displayFindingTitle(issue.title)}
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

          {recentFindings.length === 0 ? (
            <p className="text-sm text-gray-600">No findings yet. Start a scan to see results here.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentFindings.map((finding, idx) => {
                const sev = String(finding.severity || 'info').toLowerCase();
                const color = SEV_COLORS[sev] || SEV_COLORS.info;
                return (
                  <li key={`${finding.scanId}:${idx}`} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{displayFindingTitle(finding)}</p>
                      <p className="text-xs text-gray-600 truncate mt-0.5">
                        {finding.scanTarget} • {formatLocalDateTime(finding.scanCreatedAt)}
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
