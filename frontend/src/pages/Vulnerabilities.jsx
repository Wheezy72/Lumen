import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LearnCard from '../components/LearnCard.jsx';

const LEARN_HEADER_ART = {
  sqli: { from: 'from-red-500/25', to: 'to-amber-500/10' },
  xss: { from: 'from-amber-500/25', to: 'to-purple-500/10' },
  access_control: { from: 'from-purple-500/25', to: 'to-blue-500/10' },
  headers: { from: 'from-blue-500/25', to: 'to-emerald-500/10' },
  cookies: { from: 'from-emerald-500/25', to: 'to-blue-500/10' },
  ssl: { from: 'from-emerald-500/20', to: 'to-blue-500/10' },
  error: { from: 'from-slate-500/25', to: 'to-red-500/10' },
  rate_limit: { from: 'from-blue-500/20', to: 'to-slate-500/10' },
  subdomain: { from: 'from-emerald-500/20', to: 'to-slate-500/10' },
  logging: { from: 'from-slate-500/25', to: 'to-slate-500/10' },
};

const LEARN_TOPICS = [
  {
    id: 1,
    slug: 'sqli',
    name: 'SQL Injection',
    severity: 'Critical',
    shortDesc: 'Untrusted input is turned into SQL and executed by the database.',
    details:
      'SQL injection happens when user input is mixed into a query string instead of being passed as parameters. Attackers can read, modify, or delete data by changing the query logic.',
    fixes: [
      'Use parameterised queries / prepared statements (never string concatenation).',
      'Validate and normalise input server-side (length, type, expected format).',
      'Use least-privilege DB users so a bug can\'t dump the whole database.',
    ],
  },
  {
    id: 2,
    slug: 'xss',
    name: 'Cross-Site Scripting (XSS)',
    severity: 'High',
    shortDesc: 'Attacker-controlled JavaScript runs in other users\' browsers.',
    details:
      'XSS is when untrusted text is rendered as HTML/JS. It can steal session cookies, act as the user, or change what the page shows.',
    fixes: [
      'Escape output by default (HTML, attribute, URL contexts matter).',
      'Sanitise any HTML you intentionally allow (allowlist, not blocklist).',
      'Add a strict Content-Security-Policy to reduce impact if XSS slips through.',
    ],
  },
  {
    id: 3,
    slug: 'access_control',
    name: 'Broken Access Control',
    severity: 'Critical',
    shortDesc: 'Users can access data or actions they should not be able to.',
    details:
      'This is usually missing or inconsistent server-side authorisation. The client UI hiding a button doesn\'t count as security.',
    fixes: [
      'Check authorisation on every request, for every resource/action.',
      'Avoid predictable IDs where possible, and don\'t trust client-provided roles.',
      'Write a couple of tests for "user A cannot access user B\'s stuff".',
    ],
  },
  {
    id: 4,
    slug: 'headers',
    name: 'Missing Security Headers',
    severity: 'Medium',
    shortDesc: 'Browser defence-in-depth is off by default unless you enable it.',
    details:
      'Headers like CSP, HSTS, X-Frame-Options, and X-Content-Type-Options reduce the impact of other bugs by turning on built-in browser protections.',
    fixes: [
      'Add the standard headers at your reverse proxy (nginx/Caddy) or app server.',
      'Start conservative, then tighten CSP as you test pages.',
      'Turn on HSTS only after HTTPS is stable everywhere (including subdomains).',
    ],
  },
  {
    id: 5,
    slug: 'cookies',
    name: 'Insecure Session Cookies',
    severity: 'High',
    shortDesc: 'Weak cookie flags make session theft and replay much easier.',
    details:
      'If cookies lack HttpOnly/Secure/SameSite, XSS and network attackers have an easier time stealing sessions or forcing cross-site requests.',
    fixes: [
      'Set HttpOnly + Secure on session cookies.',
      'Use SameSite=Lax (or Strict where possible) to reduce CSRF risk.',
      'Rotate sessions on login and privilege changes; expire on logout.',
    ],
  },
  {
    id: 6,
    slug: 'error',
    name: 'Verbose Error Messages',
    severity: 'Medium',
    shortDesc: 'Stack traces and internal details leak useful info to attackers.',
    details:
      'Detailed errors can expose file paths, framework versions, and query fragments. Attackers use this to craft better payloads.',
    fixes: [
      'Show generic messages to users; log details server-side.',
      'Disable debug error pages in production.',
      'Redact secrets/tokens from logs and error outputs.',
    ],
  },
  {
    id: 7,
    slug: 'rate_limit',
    name: 'Missing Rate Limiting',
    severity: 'Medium',
    shortDesc: 'Sensitive endpoints accept unlimited repeated attempts.',
    details:
      'Without throttling, brute-force and abuse gets cheaper: login guesses, password reset spam, and scraping all become easier.',
    fixes: [
      'Rate limit login, register, reset-password, and other high-value endpoints.',
      'Add basic monitoring/alerts for spikes in failures.',
      'Prefer slowing down attackers over adding captchas everywhere.',
    ],
  },
  {
    id: 8,
    slug: 'subdomain',
    name: 'Exposed Subdomains',
    severity: 'Low',
    shortDesc: 'Old dev/staging hosts are often easier to break than production.',
    details:
      'Forgotten subdomains can run outdated code with weaker settings. Attackers use them as an easier entry point.',
    fixes: [
      'Keep an inventory of subdomains and retire unused ones.',
      'Protect non-prod hosts with auth/VPN and avoid using production data there.',
      'Scan your own DNS periodically to catch surprises.',
    ],
  },
  {
    id: 9,
    slug: 'logging',
    name: 'Insufficient Logging & Monitoring',
    severity: 'Low',
    shortDesc: 'Attacks go unnoticed when there\'s no visibility.',
    details:
      'If you don\'t log important events (auth failures, admin actions, access violations), incidents can sit quietly for weeks.',
    fixes: [
      'Log security-relevant events and keep them somewhere central.',
      'Alert on patterns: repeated failures, unusual traffic, new admin actions.',
      'Review logs occasionally (even weekly is better than never).',
    ],
  },
  {
    id: 10,
    slug: 'ssl',
    name: 'TLS/SSL (HTTPS) Configuration',
    severity: 'Medium',
    shortDesc: 'Weak TLS settings can expose users to interception and tampering.',
    details:
      'TLS is what makes HTTPS trustworthy. Bad certs, old protocols, or missing hardening can lead to downgrade attacks and unsafe connections.',
    fixes: [
      'Use TLS 1.2+ (prefer TLS 1.3) and disable weak ciphers.',
      'Keep certificates valid (expiry, chain, correct hostname).',
      'Use HSTS when you\'re confident HTTPS is enforced everywhere.',
    ],
  },
];

const LEARN_INCIDENTS = [
  {
    name: 'Kenya Airways (2023)',
    affected: 'Passenger and staff data',
    type: 'Ransomware',
    impact: 'Service disruption and data exposure',
    description:
      'Kenya Airways reported a ransomware incident that disrupted services and led to a data breach impacting passenger and staff information.',
  },
  {
    name: 'Equifax (2017)',
    affected: '147M users',
    type: 'Injection & Unpatched Software',
    impact: '$700M+ fines and remediation',
    description:
      'Sensitive personal data was exposed after attackers exploited an unpatched component and moved laterally inside the network.',
  },
  {
    name: 'Yahoo (2013–2014)',
    affected: '3B accounts',
    type: 'Weak Authentication & Monitoring',
    impact: 'Significant valuation impact',
    description:
      'Passwords and personal details were exposed at massive scale, and the breaches went undetected for a long period.',
  },
];


export default function Vulnerabilities() {
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeTab, setActiveTab] = useState('vulnerabilities');
  const location = useLocation();

  const toggleCard = (id) => setExpandedCard((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!location.hash) return;

    const hash = location.hash.replace('#', '');
    const match = LEARN_TOPICS.find((v) => v.slug === hash);
    if (!match) return;

    setExpandedCard(match.id);

    const el = document.getElementById(match.slug);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-2xl border border-slate-800 bg-dark-200 p-6 sm:p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/15 to-secondary-500/10 dark:from-primary-500/20 dark:to-secondary-500/15" />
        <div className="absolute -top-24 -right-24 w-[340px] h-[340px] rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-[360px] h-[360px] rounded-full bg-secondary-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
              Learning centre
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Quick notes on common web issues. Keep it simple: understand it, fix it, verify it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={activeTab === 'vulnerabilities'} onClick={() => setActiveTab('vulnerabilities')}>
              Topics
            </TabButton>
            <TabButton active={activeTab === 'breaches'} onClick={() => setActiveTab('breaches')}>
              Incidents
            </TabButton>
            <Link to="/new" className="btn btn-primary text-sm px-4 py-2">
              New scan
            </Link>
          </div>
        </div>
      </div>

      {activeTab === 'vulnerabilities' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
            <h2 className="text-sm font-semibold text-gray-200">Common topics</h2>
            <p className="text-sm text-gray-500 mt-2">
              Expand a card for a short explanation and a fix checklist.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEARN_TOPICS.map((topic) => {
              const art = LEARN_HEADER_ART[topic.slug] || { from: 'from-primary-500/20', to: 'to-secondary-500/10' };
              const expanded = expandedCard === topic.id;

              return (
                <LearnCard
                  key={topic.id}
                  topic={topic}
                  art={art}
                  expanded={expanded}
                  onToggle={() => toggleCard(topic.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'breaches' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
            <h2 className="text-sm font-semibold text-gray-200">Security incidents</h2>
            <p className="text-sm text-gray-500 mt-2">
              A few examples that show the impact when security goes wrong.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LEARN_INCIDENTS.map((b, i) => (
              <article key={i} className="rounded-xl border border-slate-800 bg-dark-200 p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">{b.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{b.affected} • {b.impact}</p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-gray-400 border border-slate-800">
                    {b.type}
                  </span>
                </div>

                <p className="text-sm text-gray-500 leading-relaxed">{b.description}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-sm font-medium border transition ${
        active
          ? 'bg-primary-500/15 text-primary-400 border-primary-500/25'
          : 'bg-slate-500/10 text-gray-400 border-slate-800 hover:bg-black/5 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}