/**
 * targetLabel.js
 *
 * Maps known localhost/127.x ports and URL paths to human-friendly app names
 * so the UI shows "DVWA" instead of "127.0.0.1" or "localhost".
 *
 * Priority order:
 *   1. Path-based match  (e.g. /dvwa/, /DVWA-master/)
 *   2. Port-based match  (e.g. :3000 → Juice Shop)
 *   3. Fall back to the raw host string
 */

// Path segments → label (case-insensitive substring match on pathname)
const PATH_LABELS = [
  { match: 'dvwa',       label: 'DVWA' },
  { match: 'juice',      label: 'Juice Shop' },
  { match: 'juiceshop',  label: 'Juice Shop' },
  { match: 'bwapp',      label: 'bWAPP' },
  { match: 'webgoat',    label: 'WebGoat' },
  { match: 'mutillidae', label: 'Mutillidae' },
  { match: 'hackazon',   label: 'Hackazon' },
  { match: 'bodgeit',    label: 'BodgeIt' },
  { match: 'vulnhub',    label: 'VulnHub' },
  { match: 'gruyere',    label: 'Gruyere' },
  { match: 'altoro',     label: 'Altoro Mutual' },
];

// Port → label (only applied when host is localhost / 127.x / ::1)
const PORT_LABELS = {
  3000:  'Juice Shop',
  3001:  'Juice Shop',
  4000:  'Lumen API',
  5173:  'Lumen Frontend',
  8080:  'DVWA',
  8888:  'DVWA',
  9090:  'bWAPP',
  9001:  'WebGoat',
  9002:  'WebGoat',
  8001:  'Mutillidae',
  8443:  'Mutillidae',
};

// Hostnames that are considered "local" (so we apply port/path labels)
const LOCAL_PATTERNS = ['localhost', '127.', '0.0.0.0', '::1', '192.168.', '10.'];

function isLocal(hostname) {
  return LOCAL_PATTERNS.some((p) => hostname.startsWith(p));
}

/**
 * Returns a friendly display label for a scan target URL.
 *
 * @param {string} targetUrl   - The full target URL, e.g. http://127.0.0.1:8080/dvwa/
 * @param {string} [targetHost] - The pre-computed host string from the backend (optional)
 * @returns {string} Friendly name like "DVWA", "Juice Shop", or the original host
 */
export function targetLabel(targetUrl, targetHost) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return targetHost || targetUrl || 'Unknown';
  }

  const { hostname, port, pathname } = parsed;
  const pathLower = pathname.toLowerCase();

  // 1. Path-based — works regardless of local/remote
  for (const { match, label } of PATH_LABELS) {
    if (pathLower.includes(match)) return label;
  }

  // 2. Port-based — only for local targets
  if (port && isLocal(hostname)) {
    const portNum = parseInt(port, 10);
    if (PORT_LABELS[portNum]) return PORT_LABELS[portNum];
  }

  // 3. Fall back: use targetHost if provided, else parsed host, else hostname
  return targetHost || parsed.host || hostname || targetUrl;
}
