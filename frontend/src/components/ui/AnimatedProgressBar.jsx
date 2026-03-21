import React, { useEffect, useMemo, useRef, useState } from 'react';

function clampPct(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export default function AnimatedProgressBar({ progress, running, label, compact = false }) {
  const target = clampPct(progress);
  const [display, setDisplay] = useState(target);
  const raf = useRef(null);

  useEffect(() => {
    const from = display;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    const duration = 700;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const pctLabel = useMemo(() => `${Math.round(display)}%`, [display]);

  return (
    <div className={compact ? '' : '\n  space-y-2\n'}>
      <div
        className={`
          ${compact ? 'h-1.5' : 'h-2.5'}
          rounded-full
          bg-slate-800
          overflow-hidden
        `.trim()}
      >
        <div
          className={`
            h-full
            rounded-full
            transition-[width]
            duration-200
            ease-out
            ${running ? 'progress-fill-running' : 'bg-emerald-500'}
          `.trim()}
          style={{ width: `${display}%` }}
        />
      </div>

      {!compact ? (
        <div
          className="
            flex
            items-center
            justify-between
            text-xs
            text-gray-600
          "
        >
          <span
            className="
              capitalize
            "
          >
            {label || (running ? 'Scanning…' : 'Complete')}
          </span>
          <span
            className="
              tabular-nums
            "
          >
            {pctLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
