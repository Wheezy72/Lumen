import React from 'react';

export default function EmptyState({ title, description, action }) {
  return (
    <div
      className="
        rounded-xl
        border
        border-slate-800
        bg-dark-200
        p-8
        text-center
      "
    >
      <h3
        className="
          text-sm
          font-semibold
          text-gray-200
        "
      >
        {title}
      </h3>

      {description ? (
        <p
          className="
            text-sm
            text-gray-500
            mt-2
            max-w-md
            mx-auto
          "
        >
          {description}
        </p>
      ) : null}

      {action ? (
        <div
          className="
            mt-5
            flex
            justify-center
          "
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
