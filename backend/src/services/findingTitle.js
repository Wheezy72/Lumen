const HEADER_HINTS = {
  'X-Frame-Options': 'Clickjacking protection',
  'X-Content-Type-Options': 'MIME sniffing protection',
  'Referrer-Policy': 'Referrer privacy',
  'Strict-Transport-Security': 'HTTPS enforcement',
  'Content-Security-Policy': 'Script and content restrictions',
};

export function getHeaderHintForTitle(title = '') {
  const raw = String(title || '');
  const match = raw.match(/^Missing security header:\s*(.+)$/i);
  if (!match) return null;

  const header = match[1].trim();
  const label = HEADER_HINTS[header] || 'Browser security';

  return { header, label };
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
