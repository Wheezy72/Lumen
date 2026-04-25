import React from 'react';

const VARIANT_CLASSES = {
  default: 'rounded-xl border border-slate-800 bg-dark-200 shadow-soft',
  glass:   'rounded-xl glass-card shadow-soft',
  accent:  'rounded-xl border border-slate-800 bg-dark-200 shadow-soft',
};

export function Card({ className = '', children, variant = 'default' }) {
  return (
    <div className={`${VARIANT_CLASSES[variant]} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`.trim()}>
      <div>
        {title ? (
          <h2 className="text-lg font-semibold text-primary-400 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary-500/70 shrink-0" />
            {title}
          </h2>
        ) : null}

        {description ? (
          <p className="text-sm text-gray-500 mt-1">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
