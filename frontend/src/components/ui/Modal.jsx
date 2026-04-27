import React, { useEffect } from 'react';

export default function Modal({ open, title, onClose, children, footer, maxWidthClass = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Card */}
      <div
        className={`relative w-full ${maxWidthClass} rounded-3xl border border-white/10 bg-dark-200/95 backdrop-blur-xl shadow-strong animate-card-enter`}
        style={{ animation: 'cardEnter 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/6">
          <div className="flex items-center gap-2">
            <span className="inline-block w-[3px] h-4 rounded-full bg-primary-500 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-200 truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full border border-white/8 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-gray-400 hover:text-gray-200 shrink-0"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">{children}</div>

        {/* Footer */}
        {footer ? (
          <div className="px-5 py-4 border-t border-white/6">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
