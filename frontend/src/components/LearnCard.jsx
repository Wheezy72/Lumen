import React, { useState } from 'react';

function severityBadge(sev) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border';
  if (sev === 'Critical') return `${base} bg-purple-500/15 text-purple-400 border-purple-500/25`;
  if (sev === 'High') return `${base} bg-red-500/15 text-red-400 border-red-500/25`;
  if (sev === 'Medium') return `${base} bg-amber-500/15 text-amber-400 border-amber-500/25`;
  if (sev === 'Low') return `${base} bg-teal-500/15 text-teal-400 border-teal-500/25`;
  return `${base} bg-slate-500/15 text-slate-400 border-slate-500/25`;
}

function Chevron({ expanded }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function LearnCard({ topic, art, expanded, onToggle }) {
  const [imageAttempt, setImageAttempt] = useState(0);

  const candidates = ['png', 'jpg', 'jpeg'];
  const showImage = imageAttempt !== -1;
  const imageUrl = showImage ? `/learn/${topic.slug}.${candidates[imageAttempt]}` : '';

  const onHeaderImageError = () => {
    setImageAttempt((prev) => {
      const next = prev + 1;
      if (next >= candidates.length) return -1;
      return next;
    });
  };

  return (
    <article
      id={topic.slug}
      className={`rounded-xl border bg-dark-200 overflow-hidden transition hover:border-primary-500/30 ${
        expanded ? 'border-primary-500/25' : 'border-slate-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="block w-full text-left"
        aria-expanded={expanded}
      >
        <div
          className={`relative w-full overflow-hidden border-b border-slate-800 transition-[height] duration-300 ${
            expanded ? 'h-52 sm:h-60 bg-black/5 dark:bg-black/30' : 'h-20 sm:h-24'
          }`}
        >
          {showImage && (
            <img
              src={imageUrl}
              alt=""
              className={`absolute inset-0 h-full w-full ${expanded ? 'object-contain' : 'object-cover'} opacity-85 dark:opacity-60`}
              onError={onHeaderImageError}
              loading="lazy"
            />
          )}

          <div className={`absolute inset-0 bg-gradient-to-r ${art.from} ${art.to} ${expanded ? 'opacity-45' : 'opacity-100'}`} />
          <div
            className={`absolute inset-0 ${expanded ? 'opacity-30 dark:opacity-20' : 'opacity-80 dark:opacity-60'}`}
            style={{
              backgroundImage:
                'radial-gradient(circle at 15% 10%, rgba(255,255,255,0.14), transparent 50%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.10), transparent 55%)',
            }}
          />
        </div>

        <div className="p-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 leading-5">{topic.name}</h3>
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              {topic.shortDesc}
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            <span className={severityBadge(topic.severity)}>{topic.severity}</span>
            <Chevron expanded={expanded} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-800 animate-slide-up">
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="rounded-lg border border-slate-800 bg-black/5 dark:bg-slate-900/20 p-4">
              <h4 className="text-[11px] font-semibold text-primary-400 uppercase tracking-wide">In plain English</h4>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">{topic.details}</p>
            </section>

            <section className="rounded-lg border border-slate-800 bg-black/5 dark:bg-slate-900/20 p-4">
              <h4 className="text-[11px] font-semibold text-primary-400 uppercase tracking-wide">Fix checklist</h4>
              <ul className="mt-2 space-y-2 text-sm text-gray-300">
                {topic.fixes.map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-secondary-400/80 shrink-0" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </article>
  );
}
