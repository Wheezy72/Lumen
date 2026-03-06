import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="py-10 bg-gray-50">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          {/* Text + actions */}
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary-600 uppercase">
              Open-source web application security scanner
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold text-dark-900">
              See your application the way an attacker does.
            </h1>
            <p className="mt-4 text-sm sm:text-base text-gray-600 max-w-xl">
              Lumen focuses on the everyday vulnerabilities that matter for developers and students:
              injection flaws, missing security headers, weak sessions and more. One form, live progress,
              and reports you can actually read.
            </p>
            <p className="mt-2 text-xs sm:text-sm text-gray-500 max-w-xl">
              The need is real: in Kenya, banks and mobile money platforms have already seen serious attacks,
              including cases where fraudsters abused online channels and social engineering to drain customer accounts.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/new"
                className="btn btn-primary px-5 py-2 text-sm sm:text-base font-semibold"
              >
                Start a scan
              </Link>
              <Link
                to="/learn"
                className="btn btn-outline px-5 py-2 text-sm sm:text-base font-semibold"
              >
                Learn how it works
              </Link>
              <Link
                to="/dashboard"
                className="btn bg-white border border-gray-200 text-gray-800 px-5 py-2 text-sm sm:text-base font-semibold"
              >
                View dashboard
              </Link>
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-4 text-xs sm:text-sm text-gray-600">
              <div>
                <dt className="font-semibold text-dark-800">10 automated checks</dt>
                <dd className="mt-1">
                  TLS, headers, XSS, SQL injection, traversal, subdomains, cookies, error handling,
                  access control and rate limiting.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-dark-800">Designed for developers</dt>
                <dd className="mt-1">
                  Simple UI, real-time updates, and PDF/CSV exports that explain how issues were
                  found and how to address them.
                </dd>
              </div>
            </dl>
          </div>

          {/* Preview card */}
          <div className="card shadow-soft">
            <div className="card-body">
              <h2 className="text-sm font-semibold text-dark-800 mb-1">
                Example scan summary
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                A typical run against a training target such as OWASP Juice Shop.
              </p>
              <ul className="space-y-2 text-xs text-gray-700">
                <li className="flex items-center justify-between">
                  <span>Reflected XSS</span>
                  <span className="badge badge-danger">High</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Missing security headers</span>
                  <span className="badge badge-warning">Medium</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Insecure session cookies</span>
                  <span className="badge badge-warning">Medium</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Verbose error messages</span>
                  <span className="badge badge-info">Low</span>
                </li>
              </ul>
              <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                Lumen does not aim to replace heavyweight enterprise tools. Instead it gives you a
                focused view of the problems you can fix quickly during development.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
