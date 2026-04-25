import React from 'react';

export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-dark-200 p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-gray-200">
        {title}
      </h3>

      {description ? (
        <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}

      {action ? (
        <div className="mt-5 flex justify-center">
          {action}
        </div>
      ) : null}
    </div>
  );
}
