export const LEARN_HEADER_ART = {
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

export const LEARN_TOPICS = [
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
      'Use least-privilege DB users so a bug can’t dump the whole database.',
    ],
  },
  {
    id: 2,
    slug: 'xss',
    name: 'Cross-Site Scripting (XSS)',
    severity: 'High',
    shortDesc: 'Attacker-controlled JavaScript runs in other users’ browsers.',
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
      'This is usually missing or inconsistent server-side authorisation. The client UI hiding a button doesn’t count as security.',
    fixes: [
      'Check authorisation on every request, for every resource/action.',
      'Avoid predictable IDs where possible, and don’t trust client-provided roles.',
      'Write a couple of tests for “user A cannot access user B’s stuff”.',
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
    shortDesc: 'Attacks go unnoticed when there’s no visibility.',
    details:
      'If you don’t log important events (auth failures, admin actions, access violations), incidents can sit quietly for weeks.',
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
      'Use HSTS when you’re confident HTTPS is enforced everywhere.',
    ],
  },
];

export const LEARN_INCIDENTS = [
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
