import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

/**
 * Simple list of scans with live updates from the SSE endpoint.
 */
export default function Scans() {
  const [scans, setScans] = useState([]);
  const [downloading, setDownloading] = useState(null); // { scanId, type } or null

  const load = async () => {
    const { data } = await axios.get('/api/scans');
    setScans(data);
  };

  useEffect(() => {
    load();
    const es = new EventSource('/api/sse/events');
    es.onmessage = () => load();
    return () => es.close();
  }, []);

  const statusBadge = (status) => {
    const base =
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize';
    if (status === 'completed') return `${base} bg-green-50 text-green-700`;
    if (status === 'running') return `${base} bg-blue-50 text-blue-700`;
    if (status === 'failed') return `${base} bg-red-50 text-red-700`;
    return `${base} bg-gray-50 text-gray-700`;
  };

  const downloadReport = async (scanId, type) => {
    try {
      setDownloading({ scanId, type });
      const endpoint = type === 'pdf' ? '/api/reports/pdf' : '/api/reports/csv';
      const { data } = await axios.post(endpoint, { scanId });
      if (data && data.url) {
        window.open(data.url, '_blank', 'noopener');
      }
    } catch (e) {
      console.error('Report download error:', e.response?.data || e.message);
    } finally {
      setDownloading(null);
    }
  };

  const isDownloading = (scanId, type) =>
    downloading && downloading.scanId === scanId && downloading.type === type;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-dark-800">Scans</h1>
          <p className="text-xs text-gray-600 mt-1">
            Each entry represents a full run of the scanner for a single target URL.
          </p>
        </div>
        <Link to="/new" className="btn btn-primary text-sm px-4 py-2">
          Start new scan
        </Link>
      </div>

      <div className="card">
        <div className="card-body p-0 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Target</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Progress</th>
                <th className="px-3 py-2 text-left font-medium">Report</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s._id} className="border-t border-gray-100">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-dark-800 truncate max-w-xs">
                      {s.targetUrl}
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.startedAt ? new Date(s.startedAt).toLocaleString() : 'Not started'}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={statusBadge(s.status)}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-xs text-gray-700">{s.progress}%</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {s.status === 'completed' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/report/${s._id}`}
                          className="text-xs font-medium text-primary-600 hover:underline"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => downloadReport(s._id, 'pdf')}
                          disabled={isDownloading(s._id, 'pdf')}
                          className="text-xs text-gray-600 hover:text-primary-700 disabled:text-gray-300"
                        >
                          {isDownloading(s._id, 'pdf') ? 'PDF…' : 'PDF'}
                        </button>
                        <span className="text-gray-300 text-xs">|</span>
                        <button
                          type="button"
                          onClick={() => downloadReport(s._id, 'csv')}
                          disabled={isDownloading(s._id, 'csv')}
                          className="text-xs text-gray-600 hover:text-primary-700 disabled:text-gray-300"
                        >
                          {isDownloading(s._id, 'csv') ? 'CSV…' : 'CSV'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Report not ready</span>
                    )}
                  </td>
                </tr>
              ))}
              {!scans.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-xs text-gray-500"
                  >
                    No scans yet. Start one with the button above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}