import React, { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = 'info', message, duration = 4000 }) => {
      const id = ++_id;
      setToasts((prev) => [...prev, { id, type, message }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TYPE_CONFIG = {
  success: {
    strip: 'bg-emerald-500',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/25',
    iconBg: 'bg-emerald-500/20',
  },
  error: {
    strip: 'bg-red-500',
    text: 'text-red-300',
    bg: 'bg-red-500/10 border-red-500/25',
    iconBg: 'bg-red-500/20',
  },
  warning: {
    strip: 'bg-amber-500',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/25',
    iconBg: 'bg-amber-500/20',
  },
  info: {
    strip: 'bg-blue-500',
    text: 'text-blue-300',
    bg: 'bg-blue-500/10 border-blue-500/25',
    iconBg: 'bg-blue-500/20',
  },
};

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.info;
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto relative flex items-start gap-3 pl-0 pr-4 py-3 rounded-xl border shadow-medium backdrop-blur-md text-sm font-medium animate-slide-in-right max-w-sm overflow-hidden ${cfg.bg}`}
          >
            {/* Left color strip */}
            <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${cfg.strip}`} />

            {/* Icon */}
            <span className={`ml-4 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.iconBg} ${cfg.text}`}>
              <ToastIcon type={t.type} />
            </span>

            <span className={`flex-1 leading-snug pt-[3px] ${cfg.text}`}>{t.message}</span>

            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="mt-0.5 opacity-50 hover:opacity-100 transition shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ToastIcon({ type }) {
  if (type === 'success') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
