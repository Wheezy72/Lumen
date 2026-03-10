import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-dark-300 text-slate-900 dark:text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest uppercase rounded-full bg-primary-500/10 dark:bg-primary-900/60 text-primary-700 dark:text-primary-400 border border-primary-500/20 dark:border-primary-700/40 mb-6">
          Open-source · Self-hostable
        </span>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-slate-900 dark:text-white">
          See your application<br className="hidden sm:block" /> the way an attacker does.
        </h1>
        <p className="mt-5 text-lg text-slate-600 dark:text-gray-400 max-w-2xl mx-auto">
          Point it at a URL. Get results in minutes.&nbsp;
          No setup, no enterprise contracts, no noise.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to="/register"
            className="btn btn-primary px-6 py-3 text-base font-semibold rounded-lg"
          >
            Get started free
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 text-base font-semibold rounded-lg border border-slate-700 text-slate-700 hover:border-primary-500 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white transition"
          >
            Sign in
          </Link>
        </div>

        {/* Stats bar */}
        <div className="mt-12 flex flex-wrap justify-center gap-x-10 gap-y-3 text-sm text-gray-500">
          {[
            '10 automated checks',
            'OWASP aligned',
            'Open source',
            'Self-hostable',
          ].map((s) => (
            <span key={s} className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-primary-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 111.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">How it works</h2>
        <p className="text-center text-gray-500 text-sm mb-10">Three steps from zero to report.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Enter a target URL',
              desc: 'Paste the address of any web application you own or have permission to test.',
              label: 'New Scan form',
            },
            {
              step: '02',
              title: 'Watch the scan run',
              desc: 'Live progress bar streams findings as each check completes — no page refresh needed.',
              label: 'Live scan progress',
            },
            {
              step: '03',
              title: 'Review your report',
              desc: 'Findings are grouped by severity with remediation guidance. Export as PDF or CSV.',
              label: 'Results & report',
            },
          ].map(({ step, title, desc, label }) => (
            <div key={step} className="flex flex-col rounded-xl border border-slate-800 bg-dark-200 overflow-hidden">
              {/* screenshot placeholder */}
              <div className="h-44 bg-dark-300 border-b border-slate-800 flex flex-col items-center justify-center gap-2 text-gray-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs">{label}</span>
              </div>
              <div className="p-5">
                <span className="text-xs font-mono text-primary-500">{step}</span>
                <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Example findings card ──────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Findings you can actually act on</h2>
            <p className="mt-3 text-slate-600 dark:text-gray-400 text-sm leading-relaxed">
              Every result includes the check that ran, the evidence collected, and plain-English guidance
              on how to fix it — not just a CVE number and a shrug.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-gray-400">
              {[
                'Grouped by severity: Critical → Low',
                'Inline remediation steps per finding',
                'PDF and CSV export',
                'Scan history and diffing over time',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 111.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-dark-200 p-6">
            <p className="text-xs text-gray-500 mb-4 font-mono">Example — OWASP Juice Shop scan</p>
            <ul className="space-y-3">
              {[
                { label: 'Reflected XSS', sev: 'High', color: 'bg-red-500/20 text-red-400' },
                { label: 'Missing security headers', sev: 'Medium', color: 'bg-yellow-500/20 text-yellow-400' },
                { label: 'Insecure session cookie', sev: 'Medium', color: 'bg-yellow-500/20 text-yellow-400' },
                { label: 'Verbose error messages', sev: 'Low', color: 'bg-blue-500/20 text-blue-400' },
                { label: 'TLS version acceptable', sev: 'Info', color: 'bg-gray-500/20 text-gray-400' },
              ].map(({ label, sev, color }) => (
                <li key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-gray-300">{label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{sev}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between text-xs text-gray-600">
              <span>5 findings</span>
              <span>Completed in 42 s</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <div className="rounded-2xl border border-primary-500/20 dark:border-primary-800/40 bg-primary-500/10 dark:bg-primary-900/20 px-8 py-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Ready to run your first scan?</h2>
          <p className="mt-2 text-slate-600 dark:text-gray-400 text-sm">Free. No credit card. Runs locally.</p>
          <Link
            to="/register"
            className="mt-6 inline-block btn btn-primary px-8 py-3 text-base font-semibold rounded-lg"
          >
            Create an account
          </Link>
        </div>
      </section>

    </div>
  );
}