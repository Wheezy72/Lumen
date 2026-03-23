const HEADER_HINTS = {
  'X-Frame-Options': {
    label: 'Clickjacking protection',
    meaning: 'Helps stop other sites from embedding your pages inside hidden iframes (a common clickjacking trick).',
  },
  'X-Content-Type-Options': {
    label: 'MIME sniffing protection',
    meaning: 'Helps browsers avoid guessing file types in a way that can enable script injection in edge cases.',
  },
  'Referrer-Policy': {
    label: 'Referrer privacy',
    meaning: 'Controls how much URL information is shared in the Referer header when users navigate away from your site.',
  },
  'Strict-Transport-Security': {
    label: 'HTTPS enforcement',
    meaning: 'Tells browsers to use HTTPS only for this site, helping prevent downgrade attacks.',
  },
  'Content-Security-Policy': {
    label: 'Script and content restrictions',
    meaning: 'Limits where scripts/styles can load from, reducing the impact of XSS if a bug exists.',
  },
};

export function getHeaderHintForTitle(title = '') {
  const raw = String(title || '');
  const match = raw.match(/^Missing security header:\s*(.+)$/i);
  if (!match) return null;

  const header = match[1].trim();
  const info = HEADER_HINTS[header];

  return {
    header,
    label: info?.label || 'Browser security',
    meaning: info?.meaning || 'A recommended browser security header was not present in the HTTP response.',
  };
}

function rewriteGenericTitle(vuln = {}) {
  const title = String(vuln.title || '');
  const category = String(vuln.category || '').toLowerCase();

  if (category === 'rate_limit' && /no obvious rate limiting/i.test(title)) return 'No rate limiting detected';
  if (category === 'cookies' && /cookies missing security flags/i.test(title)) return 'Cookie security flags missing';
  if (category === 'sqli' && /potential sql injection/i.test(title)) return 'Possible SQL injection';
  if (category === 'xss' && /reflected xss/i.test(title)) return 'Possible reflected XSS';
  if (category === 'traversal' && /directory traversal/i.test(title)) return 'Possible path traversal';
  if (category === 'subdomain' && /^Subdomain found:/i.test(title)) return title.replace(/^Subdomain found:/i, 'Public subdomain found:');
  if (category === 'ssl' && /handshake error/i.test(title)) return 'TLS/SSL connection problem';

  return title;
}

export function displayFindingTitle(vuln = {}) {
  const hint = getHeaderHintForTitle(vuln.title);
  if (hint) return `Missing ${hint.label} header (${hint.header})`;

  const rewritten = rewriteGenericTitle(vuln);
  return rewritten || 'Untitled';
}
