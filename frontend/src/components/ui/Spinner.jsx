import React from 'react';

const SIZES = {
  xs: 'w-3 h-3 border',
  sm: 'w-3.5 h-3.5 border',
  md: 'w-4 h-4 border-[1.5px]',
  lg: 'w-5 h-5 border-2',
};

export default function Spinner({ size = 'sm', className = '', label = 'Loading' }) {
  const sizeCls = SIZES[size] || SIZES.sm;
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full border-current border-t-transparent animate-spin ${sizeCls} ${className}`.trim()}
    />
  );
}

export function ButtonContent({ loading, children, loadingLabel, spinnerSize = 'sm' }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {loading ? <Spinner size={spinnerSize} className="opacity-80" /> : null}
      <span className={loading ? 'opacity-90' : ''}>
        {loading && loadingLabel ? loadingLabel : children}
      </span>
    </span>
  );
}
