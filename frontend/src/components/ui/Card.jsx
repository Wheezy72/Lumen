import React from 'react';

const VARIANT_CLASSES = {
  default: 'rounded-xl border border-gray-200 dark:border-slate-800 bg-white/60 dark:bg-dark-200 shadow-soft',
  glass:   'rounded-xl glass shadow-soft',
  accent:  'rounded-xl border-t-2 border-gray-200 dark:border-slate-800 bg-white/60 dark:bg-dark-200 shadow-soft',
};

export function Card({ className = '', children, variant = 'default', accentColor = 'border-t-primary-500' }) {
  const base = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
  const accentBorder = variant === 'accent' ? accentColor : '';
  return (
    <div className={`${base} ${accentBorder} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`.trim()}>
      <div>
        {title ? (
          <div className="flex items-center gap-2">
            <span className="inline-block w-[3px] h-4 rounded-full bg-primary-500 shrink-0" />
            <h2 className="text-base font-semibold tracking-tight text-primary-600 dark:text-primary-400">
              {title}
            </h2>
          </div>
        ) : null}
        {description ? (
          <p className="text-sm text-gray-500 mt-1 ml-[calc(3px+0.5rem)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
