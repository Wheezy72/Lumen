import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
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
  high:     '#ef4444',
  medium:   '#f59e0b',
  low:      '#3b82f6',
  info:     '#6b7280',
};

/** Returns true if a finding looks like a real vulnerability, not a scan error */
function isRealFinding(v) {
  if (!v || !v.title) return false;
  const t = v.title.toLowerCase();
  return !(
    t.includes('error') ||
    t.includes('exception') ||
    t.includes('failed') ||
    t.includes('timeout') ||
    t.includes('could not') ||
    t.includes('unable to')
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState({ totalScans: 0, openScans: 0, success: 0, failed: 0 });
  const [vulnCounts, setVulnCounts] = useState({ low: 0, medium: 0, high: 0, critical: 0, info: 0 });
  const [recent, setRecent] = useState([]);
  const [topVulns, setTopVulns] = useState([]);
  const [barScans, setBarScans] = useState([]);

  const fetchData = async () => {
    try {
      const { data } = await axios.get('/api/scans');
      const total = data.length;
      const open = data.filter((s) => ['queued', 'running'].includes(s.status)).length;
      const success = data.filter((s) => s.status === 'completed').length;
      const failed = data.filter((s) => s.status === 'failed').length;

      // Aggregate severity counts across last 10 scans (real findings only)
      const counts = { low: 0, medium: 0, high: 0, critical: 0, info: 0 };
      // Top-5 most-common finding titles
      const titleMap = {};

      data.slice(0, 10).forEach((s) => {
        s.results?.filter(isRealFinding).forEach((v) => {
          const sev = (v.severity || 'info').toLowerCase();
          if (counts[sev] !== undefined) counts[sev]++;
          titleMap[v.title] = (titleMap[v.title] || 0) + 1;
        });
      });

      // Bar chart: last 6 completed scans, each bar = severity breakdown
      const completed = data.filter((s) => s.status === 'completed').slice(0, 6).reverse();
      setBarScans(completed);

      setMetrics({ totalScans: total, openScans: open, success, failed });
      setVulnCounts(counts);
      setRecent(data.slice(0, 5));

      const sorted = Object.entries(titleMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      setTopVulns(sorted);
    } catch {
      // silently ignore — backend may not be running
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

  // ── Grouped bar chart: findings per scan, grouped by severity ──────────
  const barLabels = barScans.map((s) => {
    try { return new URL(s.target).hostname; } catch { return s.target?.slice(0, 18) || s._id?.slice(-6); }
  });

  const barData = {
    labels: barLabels.length ? barLabels : ['No data yet'],
    datasets: SEV_ORDER.map((sev) => ({
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      backgroundColor: SEV_COLORS[sev],
      data: barScans.length
        ? barScans.map((s) =>
            (s.results || []).filter(isRealFinding).filter(
              (v) => (v.severity || 'info').toLowerCase() === sev,
            ).length,
          )
        : [0],
    })),
  };

  const barOptions = {
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 12, padding: 16 } } },
    scales: {
      x: { stacked: false, ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } },
      y: { beginAtZero: true, ticks: { color: '#6b7280', precision: 0 }, grid: { color: '#1f2937' } },
    },
  };

  // ── Doughnut chart ──────────────────────────────────────────────────────
  const doughnutTotal = Object.values(vulnCounts).reduce((a, b) => a + b, 0);

  const doughnutData = {
    labels: ['Low', 'Medium', 'High', 'Critical', 'Info'],
    datasets: [{
      data: [vulnCounts.low, vulnCounts.medium, vulnCounts.high, vulnCounts.critical, vulnCounts.info],
      backgroundColor: [SEV_COLORS.low, SEV_COLORS.medium, SEV_COLORS.high, SEV_COLORS.critical, SEV_COLORS.info],
      borderWidth: 2,
      borderColor: '#111827',
    }],
  };

  const doughnutOptions = {
    cutout: '65%',
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 12, padding: 12 } } },
  };

  // Centre-text plugin (inline)
  const centreTextPlugin = {
    id: 'centreText',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#f9fafb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(doughnutTotal, cx, cy - 8);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText('findings', cx, cy + 12);
      ctx.restore();
    },
  };

  // Recent real findings (no errors)
  const recentFindings = recent.flatMap((s) =>
    (s.results || []).filter(isRealFinding).slice(0, 3).map((v) => ({
      ...v,
      scanTarget: s.target,
    })),
  ).slice(0, 8);

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Security overview</h1>
        <p className="text-sm text-gray-500 mt-1">Aggregated findings across your recent scans.</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Total scans" value={metrics.totalScans} color="text-blue-400" icon={<ScanIcon />} />
        <MetricCard label="Running" value={metrics.openScans} color="text-amber-400" icon={<SpinnerIcon />} />
        <MetricCard label="Completed" value={metrics.success} color="text-emerald-400" icon={<CheckIcon />} />
        <MetricCard label="Failed" value={metrics.failed} color="text-red-400" icon={<XIcon />} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        {/* Bar chart */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Findings per scan by severity</h3>
          {barScans.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              No completed scans yet.
            </div>
          ) : (
            <Bar data={barData} options={barOptions} />
          )}
        </div>

        {/* Doughnut chart */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-5 flex flex-col items-center min-w-[240px]">
          <h3 className="text-sm font-semibold text-white mb-4 self-start">Severity breakdown</h3>
          <div className="w-44 h-44">
            <Doughnut data={doughnutData} options={doughnutOptions} plugins={[centreTextPlugin]} />
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top vulnerabilities */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top vulnerabilities</h3>
          {topVulns.length === 0 ? (
            <p className="text-sm text-gray-600">No findings yet.</p>
          ) : (
            <ul className="space-y-2">
              {topVulns.map(([title, count]) => (
                <li key={title} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 truncate mr-3">{title}</span>
                  <span className="shrink-0 text-xs bg-slate-700 text-gray-300 px-2 py-0.5 rounded-full font-mono">
                    ×{count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent findings */}
        <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Recent findings</h3>
          {recentFindings.length === 0 ? (
            <p className="text-sm text-gray-600">No findings yet. Start a scan to see results here.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentFindings.map((v, i) => {
                const sev = (v.severity || 'info').toLowerCase();
                const color = SEV_COLORS[sev] || SEV_COLORS.info;
                return (
                  <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{v.title}</p>
                      <p className="text-xs text-gray-600 truncate mt-0.5">{v.scanTarget}</p>
                    </div>
                    <span
                      className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium mt-0.5"
                      style={{ backgroundColor: color + '25', color }}
                    >
                      {sev}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, icon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-dark-200 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center ${color} shrink-0`}>
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
