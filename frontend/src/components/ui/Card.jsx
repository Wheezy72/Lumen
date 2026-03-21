import React from 'react';

export function Card({ className = '', children }) {
  return (
    <div
      className={`
        rounded-xl
        border
        border-slate-800
        bg-dark-200
        shadow-soft
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div
      className={`
        flex
        items-start
        justify-between
        gap-4
        ${className}
      `.trim()}
    >
      <div>
        {title ? (
          <h2
            className="
              text-lg
              font-semibold
              text-primary-400
            "
          >
            {title}
          </h2>
        ) : null}

        {description ? (
          <p
            className="
              text-sm
              text-gray-500
              mt-1
            "
          >
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div
          className="
            shrink-0
          "
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
