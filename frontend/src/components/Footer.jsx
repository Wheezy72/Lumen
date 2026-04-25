import React from 'react';
import { Link } from 'react-router-dom';

const YEAR = new Date().getFullYear();

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-800 mt-8">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start justify-between gap-10">

          {/* Brand */}
          <div className="max-w-[220px]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg overflow-hidden ring-1 ring-black/10 dark:ring-white/10">
                <img src="/logo.jpg" alt="Lumen" className="h-full w-full object-cover" />
              </div>
              <span className="font-bold text-base bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                Lumen
              </span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Open-source web application security scanner. Spot issues before someone else does.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12 text-sm">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link to="/register" className="text-gray-500 hover:text-white transition-colors duration-150">
                    Get started
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="text-gray-500 hover:text-white transition-colors duration-150">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/learn" className="text-gray-500 hover:text-white transition-colors duration-150">
                    Learn
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Resources</h4>
              <ul className="space-y-2.5">
                <li>
                  <a
                    href="/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-white transition-colors duration-150"
                  >
                    API docs
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Wheezy72/Lumen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-white transition-colors duration-150 inline-flex items-center gap-1.5"
                  >
                    GitHub
                    <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-gray-600">© {YEAR} Lumen</span>
          <span className="text-xs text-gray-600">Built for learning — not for production use.</span>
        </div>
      </div>
    </footer>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <span className="text-xs text-gray-600">© {YEAR} Lumen</span>
        <div className="flex items-center gap-5 text-xs text-gray-600">
          <Link to="/learn" className="hover:text-gray-400 transition-colors duration-150">Learn</Link>
          <a
            href="https://github.com/Wheezy72/Lumen"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors duration-150"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
