import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card.jsx';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="text-center max-w-md w-full p-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-black/5 dark:bg-slate-800 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-gray-200 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-300 mb-2">Page not found!</h2>
        <p className="text-sm text-gray-500 mb-8">
          The page you’re looking for is non-existent or may have moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn btn-primary px-6 py-3">
            Go to homepage
          </Link>
          <Link
            to="/dashboard"
            className="px-6 py-3 rounded-lg border border-slate-800 bg-dark-200 text-sm font-semibold text-gray-300 hover:bg-black/5 dark:hover:bg-white/[0.02] transition"
          >
            View dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
