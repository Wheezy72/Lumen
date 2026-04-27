import React from 'react';

export default function EmptyState({ title, description, action, icon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-dark-200 px-8 py-12 text-center">
      {/* Illustration zone */}
      <div className="mx-auto mb-5 flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/8 border border-primary-500/15">
        {icon ? (
          <span className="text-primary-400">{icon}</span>
        ) : (
          <svg className="w-8 h-8 text-primary-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )}
      </div>

      <h3 className="text-base font-semibold text-gray-200">{title}</h3>

      {description ? (
        <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}

      {action ? (
        <div className="mt-6 flex justify-center">{action}</div>
      ) : null}
    </div>
  );
}
