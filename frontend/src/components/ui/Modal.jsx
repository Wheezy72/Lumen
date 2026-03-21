import React, { useEffect } from 'react';

export default function Modal({ open, title, onClose, children, footer, maxWidthClass = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="
        fixed
        inset-0
        z-50
        flex
        items-center
        justify-center
        p-4
      "
    >
      <button
        type="button"
        className="
          absolute
          inset-0
          bg-black/60
        "
        onClick={onClose}
        aria-label="Close"
      />

      <div
        className={`
          relative
          w-full
          ${maxWidthClass}
          rounded-xl
          border
          border-slate-800
          bg-dark-200
          shadow-soft
        `.trim()}
      >
        <div
          className="
            flex
            items-center
            justify-between
            gap-3
            px-4
            py-3
            border-b
            border-slate-800
          "
        >
          <h3
            className="
              text-sm
              font-semibold
              text-gray-200
              truncate
            "
          >
            {title}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="
              h-8
              w-8
              rounded-lg
              border
              border-slate-800
              bg-black/5
              dark:bg-black/30
              hover:bg-black/10
              dark:hover:bg-black/50
              transition
              flex
              items-center
              justify-center
              text-gray-400
              hover:text-gray-200
            "
            aria-label="Close"
          >
            <svg
              className="
                w-4
                h-4
              "
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div
          className="
            px-4
            py-4
          "
        >
          {children}
        </div>

        {footer ? (
          <div
            className="
              px-4
              py-3
              border-t
              border-slate-800
            "
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
