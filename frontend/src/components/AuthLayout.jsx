import React from 'react';
import ConstellationBackground from './ConstellationBackground.jsx';

export default function AuthLayout({ children }) {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-slate-50 dark:bg-dark-300" />
      <ConstellationBackground className="absolute inset-0" density={1.15} />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-slate-50/30 to-slate-50/90 dark:from-dark-300/30 dark:via-dark-300/70 dark:to-black/70" />

      <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
