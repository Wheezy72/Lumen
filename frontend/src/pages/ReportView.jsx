import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import AnimatedProgressBar from '../components/ui/AnimatedProgressBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Modal from '../components/ui/Modal.jsx';
import { displayFindingTitle, getHeaderHint } from '../utils/findingTitle.js';
import { getSeverityRank } from '../utils/severity.js';

const SEV = {
  critical: { bg: 'bg-purple-500/15 text-purple-400 border border-purple-500/30', dot: 'bg-purple-400' },
  high:     { bg: 'bg-red-500/15 text-red-400 border border-red-500/30',           dot: 'bg-red-400' },
  medium:   { bg: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',     dot: 'bg-amber-400' },
  low:      { bg: 'bg-teal-500/15 text-teal-400 border border-teal-500/30',        dot: 'bg-teal-400' },
  info:     { bg: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',     dot: 'bg-slate-400' },
};

export default function ReportView() {
  const { scanId } = useParams();

  const [scan, setScan] = useState(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [scanErrorMessage, setScanErrorMessage] = useState('');

  const [selectedFindingListIndex, setSelectedFindingListIndex] = useState(0);

  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantErrorMessage, setAssistantErrorMessage] = useState('');
  const [assistantText, setAssistantText] = useState('');

  const loadScan = async () => {
    setScanErrorMessage('');
    setScanLoading(true);

    try {
      const { data } = await axios.get('/api/scans/' + scanId);
      setScan(data);
      setSelectedFindingListIndex(0);
    } catch {
      setScanErrorMessage('Failed to load scan results');
    } finally {
      setScanLoading(false);
    }
  };

  const loadDiff = async () => {
    setDiffLoading(true);

    try {
      const { data } = await axios.get(`/api/scans/${scanId}/diff`);
      setDiffData(data);
    } catch {
      setDiffData(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const generatePdf = async () => {
    setPdfLoading(true);

    try {
      const { data } = await axios.post('/api/reports/pdf', { scanId });
      window.open(data.url, '_blank');
    } catch {
      alert('Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const generateCsv = async () => {
    setCsvLoading(true);

    try {
      const { data } = await axios.post('/api/reports/csv', { scanId });
      window.open(data.url, '_blank');
    } catch {
      alert('Failed to generate CSV');
    } finally {
      setCsvLoading(false);
    }
  };

  useEffect(() => {
    loadScan();
    loadDiff();

    const es = new EventSource('/api/sse/events');

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.scanId !== scanId) return;

        if (msg.type === 'progress') {
          setScan((prev) => (prev
            ? { ...prev, progress: msg.progress ?? prev.progress, status: 'running' }
            : prev
          ));
          return;
        }

        if (msg.type === 'failed') {
          setScan((prev) => (prev
            ? { ...prev, status: 'failed', error: msg.error || prev.error }
            : prev
          ));
          return;
        }

        if (msg.type === 'completed') {
          loadScan();
          loadDiff();
        }
      } catch {
        // ignore invalid event payloads
      }
    };

    return () => es.close();
  }, [scanId]);

  useEffect(() => {
    setSelectedFindingListIndex(0);
  }, [scanId]);

  const findings = scan?.results || [];

  const sortedFindings = useMemo(() => {
    const findingsWithIndex = findings.map((f, idx) => ({ ...f, __index: idx }));

    return [...findingsWithIndex].sort((a, b) => {
      const d = getSeverityRank(b.severity) - getSeverityRank(a.severity);
      if (d) return d;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }, [findings]);

  const topFindings = useMemo(() => sortedFindings.slice(0, 3), [sortedFindings]);

  const safeSelectedIndex = Math.min(selectedFindingListIndex, Math.max(sortedFindings.length - 1, 0));
  const selectedFinding = sortedFindings[safeSelectedIndex];
  const selectedFindingIndex = typeof selectedFinding?.__index === 'number' ? selectedFinding.__index : null;

  const isRunning = scan?.status === 'running' || scan?.status === 'queued' || scan?.status === 'scheduled';
  const statusColor = getStatusColor(scan?.status);

  const openAssistantForSelectedFinding = async () => {
    if (selectedFindingIndex === null) return;

    setAssistantOpen(true);
    setAssistantErrorMessage('');
    setAssistantText('');

    setAssistantLoading(true);

    try {
      const { data } = await axios.post('/api/ai/chat', {
        scanId,
        findingIndex: selectedFindingIndex,
        messages: [{
          role: 'user',
          content: 'Explain this finding in simple terms. Include what it means, why it matters, how to fix it, and how to verify the fix.',
        }],
      });

      setAssistantText(data?.assistant?.content || '');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to load the explanation.';
      setAssistantErrorMessage(msg);
    } finally {
      setAssistantLoading(false);
    }
  };

  if (scanLoading) {
    return (
      <div
        className="
          flex
          items-center
          justify-center
          min-h-[400px]
        "
      >
        <div
          className="
            text-center
          "
        >
          <div
            className="
              animate-spin
              w-8
              h-8
              mx-auto
              border-2
              border-primary-500
              border-t-transparent
              rounded-full
              mb-4
            "
          />
          <p
            className="
              text-gray-500
              text-sm
            "
          >
            Loading scan results…
          </p>
        </div>
      </div>
    );
  }

  if (scanErrorMessage) {
    return (
      <div
        className="
          text-center
          py-16
        "
      >
        <p
          className="
            text-red-400
            mb-4
          "
        >
          {scanErrorMessage}
        </p>
        <div
          className="
            flex
            items-center
            justify-center
            gap-3
          "
        >
          <button
            onClick={loadScan}
            className="
              text-primary-500
              hover:underline
              text-sm
            "
          >
            Try again
          </button>
          <Link
            to="/login"
            className="
              text-gray-500
              hover:text-gray-400
              text-sm
            "
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="
          space-y-5
        "
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="
            flex
            flex-col
            md:flex-row
            md:items-start
            md:justify-between
            gap-4
          "
        >
          <div>
            <h1
              className="
                text-2xl
                font-bold
                bg-gradient-to-r
                from-primary-400
                to-secondary-400
                bg-clip-text
                text-transparent
              "
            >
              Scan report
            </h1>
            <p
              className="
                text-gray-500
                mt-1
                break-all
                text-sm
              "
            >
              {scan?.targetUrl}
            </p>
          </div>

          <div
            className="
              flex
              gap-2
              shrink-0
            "
          >
            <button
              onClick={generatePdf}
              disabled={pdfLoading}
              className="
                px-4
                py-2
                rounded-lg
                text-sm
                font-medium
                bg-dark-200
                border
                border-slate-800
                hover:bg-black/5
                dark:hover:bg-slate-800
                disabled:opacity-50
                transition
              "
            >
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </button>
            <button
              onClick={generateCsv}
              disabled={csvLoading}
              className="
                px-4
                py-2
                rounded-lg
                text-sm
                font-medium
                btn
                btn-primary
                disabled:opacity-50
              "
            >
              {csvLoading ? 'Generating…' : 'Download CSV'}
            </button>
          </div>
        </div>

        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-4
          "
        >
          {/* Summary */}
          <div
            className="
              lg:col-span-2
              rounded-xl
              border
              border-slate-800
              bg-dark-200
              p-5
            "
          >
            <h2
              className="
                text-sm
                font-semibold
                text-white
              "
            >
              Summary
            </h2>
            <p
              className="
                text-sm
                text-gray-500
                mt-1
              "
            >
              {findings.length === 0
                ? (isRunning ? 'Scanning…' : 'No issues found.')
                : `${findings.length} issues found. Top ones are below.`}
            </p>

            {topFindings.length > 0 ? (
              <ul
                className="
                  mt-4
                  space-y-2
                "
              >
                {topFindings.map((f, i) => (
                  <li
                    key={i}
                    className="
                      flex
                      items-start
                      justify-between
                      gap-3
                    "
                  >
                    <div
                      className="
                        min-w-0
                      "
                    >
                      <p
                        className="
                          text-sm
                          text-gray-200
                          truncate
                        "
                      >
                        {displayFindingTitle(f)}
                      </p>
                      <p
                        className="
                          text-xs
                          text-gray-600
                          mt-0.5
                        "
                      >
                        {formatCategoryLabel(f.category)}
                      </p>
                    </div>
                    <SeverityDot severity={(f.severity || 'info').toLowerCase()} />
                  </li>
                ))}
              </ul>
            ) : (
              <div
                className="
                  mt-4
                  text-sm
                  text-gray-600
                "
              >
                {isRunning ? 'Issues will show when the scan is done.' : 'No issues found.'}
              </div>
            )}

            <div
              className="
                mt-4
                pt-4
                border-t
                border-slate-800
                flex
                flex-wrap
                gap-2
              "
            >
              <Link
                to="/scans"
                className="
                  px-3
                  py-2
                  rounded-lg
                  text-sm
                  font-medium
                  bg-dark-300
                  border
                  border-slate-800
                  hover:bg-black/5
                  dark:hover:bg-slate-800
                  transition
                "
              >
                Back to scans
              </Link>
              <Link
                to="/new"
                className="
                  px-3
                  py-2
                  rounded-lg
                  text-sm
                  font-medium
                  btn
                  btn-primary
                "
              >
                New scan
              </Link>
            </div>
          </div>

          {/* Changes */}
          <div
            className="
              rounded-xl
              border
              border-slate-800
              bg-dark-200
              p-5
            "
          >
            <div
              className="
                flex
                items-start
                justify-between
                gap-3
              "
            >
              <div>
                <h2
                  className="
                    text-sm
                    font-semibold
                    text-white
                  "
                >
                  Changes
                </h2>
                <p
                  className="
                    text-xs
                    text-gray-600
                    mt-1
                  "
                >
                  Compared to the previous scan
                </p>
              </div>

              {diffData?.compareScanId ? (
                <Link
                  to={`/report/${diffData.compareScanId}`}
                  className="
                    text-xs
                    font-semibold
                    text-primary-400
                    hover:text-primary-300
                    transition
                  "
                >
                  View previous →
                </Link>
              ) : null}
            </div>

            <div
              className="
                mt-4
                space-y-3
              "
            >
              <div
                className="
                  rounded-lg
                  border
                  border-slate-800
                  bg-black/5
                  dark:bg-black/30
                  p-3
                "
              >
                <p
                  className="
                    text-xs
                    text-gray-600
                  "
                >
                  Note
                </p>

                {diffData?.compareScanId ? (
                  (scan?.diffSummary?.newBlockedCount || 0) > 0 ? (
                    <p
                      className="
                        text-sm
                        text-red-400
                        mt-1
                      "
                    >
                      New serious issues:{' '}
                      <span
                        className="
                          font-semibold
                          tabular-nums
                        "
                      >
                        {scan.diffSummary.newBlockedCount}
                      </span>
                    </p>
                  ) : (
                    <p
                      className="
                        text-sm
                        text-emerald-400
                        mt-1
                      "
                    >
                      No new serious issues since the last scan.
                    </p>
                  )
                ) : (
                  <p
                    className="
                      text-sm
                      text-gray-600
                      mt-1
                    "
                  >
                    Run another scan to see changes.
                  </p>
                )}
              </div>

              <div
                className="
                  rounded-lg
                  border
                  border-slate-800
                  bg-black/5
                  dark:bg-black/30
                  p-3
                "
              >
                <p
                  className="
                    text-xs
                    text-gray-600
                  "
                >
                  Changes
                </p>

                {diffLoading ? (
                  <p
                    className="
                      text-sm
                      text-gray-500
                      mt-1
                    "
                  >
                    Loading…
                  </p>
                ) : diffData?.compareScanId ? (
                  <div
                    className="
                      mt-2
                      space-y-2
                    "
                  >
                    <p
                      className="
                        text-sm
                        text-gray-200
                      "
                    >
                      Compared to {formatLocalDateTime(diffData.compareCreatedAt)}
                    </p>

                    {diffData?.diff ? (
                      <div
                        className="
                          grid
                          grid-cols-3
                          gap-2
                          text-xs
                        "
                      >
                        <Stat label="New" value={diffData.diff.newIssues?.length || 0} className="text-red-400" />
                        <Stat label="Fixed" value={diffData.diff.fixedIssues?.length || 0} className="text-emerald-400" />
                        <Stat label="Still there" value={diffData.diff.persisting?.length || 0} className="text-gray-300" />
                      </div>
                    ) : (
                      <p
                        className="
                          text-sm
                          text-gray-600
                        "
                      >
                        No comparison available yet.
                      </p>
                    )}
                  </div>
                ) : (
                  <p
                    className="
                      text-sm
                      text-gray-600
                      mt-1
                    "
                  >
                    No previous scan for this site yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Meta bar ───────────────────────────────────────────── */}
        <div
          className="
            rounded-xl
            border
            border-slate-800
            bg-dark-200
            p-5
          "
        >
          <div
            className="
              grid
              grid-cols-2
              md:grid-cols-4
              gap-4
              text-sm
            "
          >
            <div>
              <p
                className="
                  text-xs
                  text-gray-600
                  mb-1
                "
              >
                Status
              </p>
              <p
                className={`
                  font-semibold
                  capitalize
                  ${statusColor}
                `.trim()}
              >
                {scan?.status}
              </p>
            </div>
            <div>
              <p
                className="
                  text-xs
                  text-gray-600
                  mb-1
                "
              >
                Progress
              </p>
              <p
                className="
                  font-semibold
                  text-white
                "
              >
                {scan?.progress ?? 0}%
              </p>
            </div>
            <div>
              <p
                className="
                  text-xs
                  text-gray-600
                  mb-1
                "
              >
                Started
              </p>
              <p
                className="
                  font-semibold
                  text-white
                "
              >
                {formatLocalDateTime(scan?.startedAt)}
              </p>
            </div>
            <div>
              <p
                className="
                  text-xs
                  text-gray-600
                  mb-1
                "
              >
                Completed
              </p>
              <p
                className="
                  font-semibold
                  text-white
                "
              >
                {formatLocalDateTime(scan?.completedAt)}
              </p>
            </div>
          </div>

          <div
            className="
              mt-4
            "
          >
            <AnimatedProgressBar progress={scan?.progress ?? 0} running={isRunning} />
          </div>
        </div>

        {/* ── Findings + Detail ──────────────────────────────────── */}
        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-4
          "
        >
          {/* Findings list */}
          <div
            className="
              rounded-xl
              border
              border-slate-800
              bg-dark-200
              p-4
            "
          >
            <div
              className="
                flex
                items-end
                justify-between
                gap-3
                mb-3
              "
            >
              <h2
                className="
                  font-semibold
                  text-white
                  text-sm
                "
              >
                Findings{' '}
                <span
                  className="
                    text-gray-600
                    font-normal
                  "
                >
                  ({sortedFindings.length})
                </span>
              </h2>
            </div>

            {findings.length === 0 ? (
              <div
                className="
                  py-6
                "
              >
                <EmptyState
                  title={isRunning ? 'Scanning…' : 'No issues found'}
                  description={isRunning ? 'Issues will show here when the scan is done.' : 'This scan finished with no issues.'}
                />
              </div>
            ) : (
              <ul
                className="
                  space-y-1.5
                  max-h-[460px]
                  overflow-y-auto
                  pr-1
                "
              >
                {sortedFindings.map((f, i) => {
                  const sev = (f.severity || 'info').toLowerCase();
                  const active = i === safeSelectedIndex;

                  return (
                    <li
                      key={typeof f.__index === 'number' ? f.__index : i}
                      onClick={() => setSelectedFindingListIndex(i)}
                      className={
                        `
                          p-3
                          rounded-lg
                          cursor-pointer
                          transition
                          border
                          ${active
                            ? 'bg-primary-500/10 dark:bg-primary-900/30 border-primary-500/30 dark:border-primary-700/50'
                            : 'border-transparent hover:bg-black/5 dark:hover:bg-slate-800/50'
                          }
                        `
                      }
                    >
                      <div
                        className="
                          flex
                          items-start
                          justify-between
                          gap-2
                        "
                      >
                        <span
                          className="
                            text-sm
                            text-gray-200
                            font-medium
                            leading-snug
                          "
                        >
                          {displayFindingTitle(f)}
                        </span>
                        <SeverityDot severity={sev} />
                      </div>
                      <div
                        className="
                          mt-1
                          text-xs
                          text-gray-600
                        "
                      >
                        {formatCategoryLabel(f.category)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail panel */}
          <div
            className="
              lg:col-span-2
              rounded-xl
              border
              border-slate-800
              bg-dark-200
              p-5
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
                gap-3
                mb-4
              "
            >
              <h2
                className="
                  font-semibold
                  text-white
                  text-sm
                "
              >
                Details
              </h2>
              <button
                type="button"
                onClick={openAssistantForSelectedFinding}
                disabled={!selectedFinding || selectedFindingIndex === null}
                className="
                  px-3
                  py-1.5
                  rounded-lg
                  text-xs
                  font-semibold
                  border
                  border-slate-800
                  bg-black/5
                  dark:bg-black/30
                  hover:bg-black/10
                  dark:hover:bg-black/50
                  transition
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                  text-gray-200
                "
              >
                Explain
              </button>
            </div>

            {!selectedFinding ? (
              <div
                className="
                  py-16
                  text-center
                  text-gray-600
                  text-sm
                "
              >
                Select a finding from the list.
              </div>
            ) : (
              <div
                className="
                  space-y-5
                "
              >
                <div
                  className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                >
                  <div>
                    <h3
                      className="
                        text-lg
                        font-semibold
                        text-white
                      "
                    >
                      {displayFindingTitle(selectedFinding)}
                    </h3>
                    <div
                      className="
                        mt-1
                        text-xs
                        text-gray-600
                      "
                    >
                      {formatCategoryLabel(selectedFinding.category)}
                      {selectedFinding.cve ? ` • ${selectedFinding.cve}` : ''}
                    </div>
                  </div>

                  <SeverityBadge severity={(selectedFinding.severity || 'info').toLowerCase()} />
                </div>

                {(() => {
                  const headerHint = getHeaderHint(selectedFinding);
                  if (!selectedFinding.description && !headerHint) return null;

                  return (
                    <div>
                      <h4
                        className="
                          text-xs
                          font-semibold
                          text-primary-500
                          uppercase
                          tracking-wide
                          mb-2
                        "
                      >
                        Description
                      </h4>

                      {selectedFinding.description ? (
                        <p
                          className="
                            text-gray-300
                            text-sm
                            leading-relaxed
                          "
                        >
                          {selectedFinding.description}
                        </p>
                      ) : null}

                      {headerHint ? (
                        <p
                          className={
                            `
                              text-sm
                              leading-relaxed
                              ${selectedFinding.description ? 'mt-2 text-gray-400' : 'text-gray-300'}
                            `
                          }
                        >
                          {headerHint.meaning}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}

                {selectedFinding.evidence ? (
                  <div>
                    <h4
                      className="
                        text-xs
                        font-semibold
                        text-primary-500
                        uppercase
                        tracking-wide
                        mb-2
                      "
                    >
                      Evidence
                    </h4>
                    <div
                      className="
                        rounded-lg
                        bg-black/5
                        dark:bg-black/50
                        border
                        border-slate-800
                        p-3
                        text-xs
                        text-gray-300
                        font-mono
                        break-all
                      "
                    >
                      {selectedFinding.evidence}
                    </div>
                  </div>
                ) : null}

                <div>
                  <h4
                    className="
                      text-xs
                      font-semibold
                      text-primary-500
                      uppercase
                      tracking-wide
                      mb-2
                    "
                  >
                    How we found it
                  </h4>
                  <p
                    className="
                      text-gray-400
                      text-sm
                    "
                  >
                    {getDetectionMethod(selectedFinding.category)}
                  </p>
                </div>

                <div
                  className="
                    rounded-lg
                    border
                    border-emerald-800/40
                    bg-emerald-900/10
                    p-4
                  "
                >
                  <h4
                    className="
                      text-xs
                      font-semibold
                      text-emerald-400
                      uppercase
                      tracking-wide
                      mb-2
                    "
                  >
                    How to fix
                  </h4>

                  <p
                    className="
                      text-emerald-300/80
                      text-sm
                      mb-3
                    "
                  >
                    {getRemediationAdvice(selectedFinding.category)}
                  </p>

                  {getCodeExample(selectedFinding.category) ? (
                    <pre
                      className="
                        mt-2
                        rounded-lg
                        bg-black/5
                        dark:bg-black/60
                        border
                        border-slate-800
                        p-3
                        text-xs
                        text-emerald-400
                        font-mono
                        overflow-x-auto
                        whitespace-pre
                      "
                    >
                      {getCodeExample(selectedFinding.category)}
                    </pre>
                  ) : null}
                </div>

                <div
                  className="
                    pt-4
                    border-t
                    border-slate-800
                  "
                >
                  <Link
                    to={'/learn#' + (selectedFinding.category || 'other')}
                    className="
                      text-primary-500
                      hover:text-primary-400
                      text-sm
                      font-medium
                      transition
                    "
                  >
                    Learn more about this issue →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={assistantOpen}
        title="Explanation"
        onClose={() => {
          setAssistantOpen(false);
          setAssistantErrorMessage('');
          setAssistantLoading(false);
          setAssistantText('');
        }}
        maxWidthClass="max-w-3xl"
        footer={
          <div
            className="
              flex
              justify-end
            "
          >
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              className="
                px-4
                py-2
                rounded-lg
                text-sm
                font-semibold
                border
                border-slate-800
                bg-black/5
                dark:bg-black/30
                hover:bg-black/10
                dark:hover:bg-black/50
                transition
                text-gray-200
              "
            >
              Close
            </button>
          </div>
        }
      >
        {assistantErrorMessage ? (
          <div
            className="
              mb-3
              p-3
              rounded-lg
              border
              border-red-500/30
              bg-red-900/20
              text-red-400
              text-sm
            "
          >
            {assistantErrorMessage}
          </div>
        ) : null}

        <div
          className="
            rounded-lg
            border
            border-slate-800
            bg-black/5
            dark:bg-black/30
            p-4
            max-h-[60vh]
            overflow-y-auto
          "
        >
          {assistantLoading ? (
            <div
              className="
                text-sm
                text-gray-400
              "
            >
              Generating explanation…
            </div>
          ) : assistantText ? (
            <div
              className="
                whitespace-pre-wrap
                leading-relaxed
                text-sm
                text-gray-200
              "
            >
              {assistantText}
            </div>
          ) : (
            <div
              className="
                text-sm
                text-gray-600
              "
            >
              Select a finding and click{' '}
              <span
                className="
                  text-gray-300
                  font-semibold
                "
              >
                Explain
              </span>
              .
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}



function getStatusColor(status) {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'running') return 'text-blue-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-gray-400';
}

function formatLocalDateTime(value) {
  if (!value) return '—';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatCategoryLabel(category) {
  const c = String(category || '').toLowerCase();
  if (!c) return 'General';

  const map = {
    headers: 'Security headers',
    cookies: 'Cookies',
    tls: 'TLS/SSL',
    ssl: 'TLS/SSL',
    xss: 'XSS',
    sqli: 'SQL injection',
    traversal: 'Path traversal',
    subdomain: 'Subdomains',
    error: 'Error details',
    rate_limit: 'Rate limiting',
    access_control: 'Access control',
  };

  return map[c] || c.replace(/_/g, ' ');
}

function SeverityBadge({ severity }) {
  const style = SEV[severity] || SEV.info;

  return (
    <span
      className={`
        shrink-0
        px-2
        py-0.5
        rounded-full
        text-xs
        font-medium
        uppercase
        ${style.bg}
      `}
    >
      {severity}
    </span>
  );
}

function SeverityDot({ severity }) {
  const style = SEV[severity] || SEV.info;

  return (
    <span
      className={`
        mt-1
        h-2.5
        w-2.5
        rounded-full
        ${style.dot}
      `}
    />
  );
}

function Stat({ label, value, className }) {
  return (
    <div
      className="
        rounded-lg
        border
        border-slate-800
        bg-black/5
        dark:bg-black/30
        p-2
      "
    >
      <p
        className="
          text-[11px]
          text-gray-600
        "
      >
        {label}
      </p>
      <p
        className={`
          text-sm
          font-semibold
          tabular-nums
          ${className || 'text-gray-200'}
        `}
      >
        {value}
      </p>
    </div>
  );
}

function getDetectionMethod(category) {
  const methods = {
    xss: 'We added a small test value and checked if it comes back in the page.',
    sqli: 'We added test input and looked for database-style error messages.',
    headers: 'We checked if common security headers are missing.',
    ssl: 'We checked the TLS/SSL connection and certificate.',
    tls: 'We checked the TLS/SSL connection and certificate.',
    traversal: 'We tried ../ style paths and checked for file leaks.',
    subdomain: 'We tried common subdomain names and checked what exists.',
    cookies: 'We checked cookies for missing security flags.',
    error: 'We checked if the site shows detailed errors or stack traces.',
    access_control: 'We changed IDs in the URL to see if other data is reachable.',
    rate_limit: 'We sent a burst of requests and checked for rate limiting.',
  };

  return methods[category] || 'We ran automated checks.';
}

function getRemediationAdvice(category) {
  const advice = {
    xss: 'Escape output, validate input, and add a Content-Security-Policy.',
    sqli: 'Use parameterized queries (never build SQL with user input).',
    headers: 'Add common security headers (CSP, HSTS, X-Frame-Options).',
    ssl: 'Use TLS 1.2+ only and keep certificates valid.',
    tls: 'Use TLS 1.2+ only and keep certificates valid.',
    traversal: 'Do not use user input as file paths. Use allow-lists.',
    subdomain: 'Check if the subdomain should be public. Add auth if needed.',
    cookies: 'Set HttpOnly, Secure, and SameSite on session cookies.',
    error: 'Do not show stack traces to users. Log them on the server.',
    access_control: 'Check permissions on every request (server-side).',
    rate_limit: 'Add rate limiting to login and other sensitive routes.',
  };

  return advice[category] || 'Fix the root cause, then run the scan again.';
}

function getCodeExample(category) {
  const examples = {
    xss: '// Use textContent instead of innerHTML\nelement.textContent = userInput;',
    sqli: '// Use parameterized queries\ndb.query("SELECT * FROM users WHERE id = ?", [id]);',
    headers: '// Add security headers with helmet\napp.use(helmet());',
    cookies: '// Secure cookie settings\nres.cookie("session", token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: "strict"\n});',
    rate_limit: '// Express rate limiter\nconst limit = rateLimit({ windowMs: 15*60*1000, max: 5 });\napp.use("/login", limit);',
  };

  return examples[category] || null;
}