import React, { useMemo } from 'react';

const COLORS = {
  critical: 'bg-purple-500',
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-teal-500',
  info: 'bg-slate-500',
};

export default function SeverityMiniBar({ findings }) {
  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    (findings || []).forEach((f) => {
      const s = (f.severity || 'info').toLowerCase();
      if (c[s] !== undefined) c[s] += 1;
    });

    return c;
  }, [findings]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (!total) {
    return (
      <div
        className="
          h-1.5
          rounded-full
          bg-slate-800
          overflow-hidden
        "
        title="No findings"
      >
        <div
          className="
            h-full
            w-full
            bg-emerald-500/40
          "
        />
      </div>
    );
  }

  return (
    <div
      className="
        h-1.5
        rounded-full
        bg-slate-800
        overflow-hidden
        flex
      "
      title="Severity breakdown"
    >
      {Object.entries(counts).map(([sev, n]) =>
        n ? (
          <div
            key={sev}
            className={`
              ${COLORS[sev]}
              h-full
            `.trim()}
            style={{ width: `${(n / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
