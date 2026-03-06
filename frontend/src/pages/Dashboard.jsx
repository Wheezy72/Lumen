import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart,
  ArcElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
Chart.register(ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Dashboard shows a minimal overview that is still useful:
 * - basic scan counts
 * - a simple outcomes trend
 * - a breakdown of severity for recent scans
 * - a short list of recent findings
 */
export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalScans: 0,
    openScans: 0,
    success: 0,
    failed: 0,
  });
  const [vulnCounts, setVulnCounts] = useState({
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  });
  const [recent, setRecent] = useState([]);

  const fetchData = async () => {
    const { data } = await axios.get('/api/scans');
    const total = data.length;
    const open = data.filter((s) => s.status === 'queued' || s.status === 'running').length;
    const success = data.filter((s) => s.status === 'completed').length;
    const failed = data.filter((s) => s.status === 'failed').length;
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };

    data.slice(0, 10).forEach((s) =>
      s.results?.forEach((v) => {
        const sev = v.severity || 'low';
        counts[sev] = (counts[sev] || 0) + 1;
      }),
    );

    setMetrics({ totalScans: total, openScans: open, success, failed });
    setVulnCounts(counts);
    setRecent(data.slice(0, 5));
  };

  useEffect(() => {
    fetchData();
    const es = new EventSource('/api/sse/events');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'progress' || msg.type === 'completed' || msg.type === 'failed') {
        fetchData();
      }
    };
    return () => es.close();
  }, []);

  const lineData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Completed scans',
        data: Array(7).fill(metrics.success),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.2)',
        tension: 0.3,
      },
      {
        label: 'Failed scans',
        data: Array(7).fill(metrics.failed),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.2)',
        tension: 0.3,
      },
    ],
  };

  const doughnutData = {
    labels: ['Low', 'Medium', 'High', 'Critical'],
    datasets: [
      {
        data: [vulnCounts.low, vulnCounts.medium, vulnCounts.high, vulnCounts.critical],
        backgroundColor: ['#93c5fd', '#fbbf24', '#ef4444', '#7c3aed'],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-dark-800">Security overview</h1>
        <p className="text-xs text-gray-600 mt-1">
          A quick view of how many scans you have run and how serious the recent findings are.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricBox title="Total scans" value={metrics.totalScans}>
          <CircleIcon className="w-4 h-4 text-blue-500" />
        </MetricBox>
        <MetricBox title="Open scans" value={metrics.openScans}>
          <CircleIcon className="w-4 h-4 text-amber-500" />
        </MetricBox>
        <MetricBox title="Completed" value={metrics.success}>
          <CircleIcon className="w-4 h-4 text-emerald-500" />
        </MetricBox>
        <MetricBox title="Failed" value={metrics.failed}>
          <CircleIcon className="w-4 h-4 text-red-500" />
        </MetricBox>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="chart-container animate-slide-up">
          <h3 className="font-semibold mb-2 text-sm text-dark-800">Scan outcomes</h3>
          <Line data={lineData} />
        </div>
        <div
          className="chart-container animate-slide-up"
          style={{ animationDelay: '80ms' }}
        >
          <h3 className="font-semibold mb-2 text-sm text-dark-800">
            Vulnerabilities by severity (last 10 scans)
          </h3>
          <Doughnut data={doughnutData} />
        </div>
      </div>

      <div
        className="card animate-slide-up"
        style={{ animationDelay: '160ms' }}
      >
        <div className="card-body">
          <h3 className="font-semibold mb-3 text-sm text-dark-800">
            Recent findings
          </h3>
          <ul className="divide-y">
            {recent.flatMap(
              (s) =>
                s.results?.slice(0, 5).map((v) => (
                  <li
                    key={`${s._id}-${v.title}`}
                    className="py-2 flex justify-between items-center"
                  >
                    <div className="text-sm text-gray-800 truncate max-w-xs">
                      {v.title}
                    </div>
                    <span className="text-xs text-gray-500 uppercase">
                      {v.severity}
                    </span>
                  </li>
                )) || [],
            )}
            {!recent.length && (
              <li className="py-2 text-xs text-gray-500">
                No recent scans yet. Start one to see results here.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ title, value, children }) {
  return (
    <div className="card animate-slide-up">
      <div className="card-body flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="text-2xl font-semibold text-dark-800 mt-1">{value}</div>
        </div>
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100">
          {children}
        </div>
      </div>
    </div>
  );
}

function CircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}