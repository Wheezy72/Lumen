import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card.jsx';

export default function ErrorPage({ error, onRetry }) {
  const isNetworkError = error?.message?.includes('Network') || error?.code === 'ECONNREFUSED';
  const is500Error = error?.response?.status >= 500;

  let title = 'Something went wrong';
  let description = 'An unexpected error occurred. Please try again.';
  let icon = 'error';

  if (isNetworkError) {
    title = 'Connection error';
    description = 'Unable to connect to the server. Please check your connection and try again.';
    icon = 'network';
  } else if (is500Error) {
    title = 'Server error';
    description = 'The server encountered an error. Please try again later.';
    icon = 'server';
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="text-center max-w-md w-full p-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
          {icon === 'network' ? (
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
            </svg>
          ) : icon === 'server' ? (
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-200 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">{description}</p>

        {error?.message && process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-3 rounded-lg border border-slate-800 bg-dark-200 text-left">
            <p className="text-xs text-gray-500 font-mono break-all">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button onClick={onRetry} className="btn btn-primary px-6 py-3">
              Try again
            </button>
          )}
          <Link
            to="/"
            className="px-6 py-3 rounded-lg border border-slate-800 bg-dark-200 text-sm font-semibold text-gray-300 hover:bg-black/5 dark:hover:bg-white/[0.02] transition"
          >
            Go to homepage
          </Link>
        </div>
      </Card>
    </div>
  );
}
