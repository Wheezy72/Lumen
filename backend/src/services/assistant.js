import { displayFindingTitle, getHeaderHintForTitle } from './findingTitle.js';

// ---------------------------------------------------------------------------
// Why each header matters — shown in the "Why it matters" section
// ---------------------------------------------------------------------------

const HEADER_IMPACTS = {
  'X-Frame-Options':
    'Without it, attackers can embed your pages in invisible iframes and trick users into clicking things they didn\'t intend to (clickjacking).',
  'X-Content-Type-Options':
    'Without it, browsers may misinterpret a file\'s type and execute it as script, opening the door to certain injection attacks.',
  'Referrer-Policy':
    'Without it, full URLs (which can contain tokens or session IDs) can leak to third-party sites via the Referer header.',
  'Strict-Transport-Security':
    'Without it, a network attacker can strip HTTPS from a connection and intercept or modify traffic even on a site that supports TLS.',
  'Content-Security-Policy':
    'Without it, a successful XSS payload has no browser-level containment — scripts can read cookies, redirect users, or exfiltrate data.',
};

// ---------------------------------------------------------------------------
// Why each vulnerability category matters
// ---------------------------------------------------------------------------

const CATEGORY_IMPACTS = {
  xss:
    'An attacker can run arbitrary JavaScript in a victim\'s browser — enabling session hijacking, credential theft, or full account takeover.',
  sqli:
    'An attacker may be able to read, modify, or delete database records, bypass authentication, or (in some configurations) execute commands on the server.',
  headers:
    'Missing security headers remove browser-enforced protections that are cheap to add and meaningfully reduce the impact of common exploits.',
  cookies:
    'Without the correct flags, session tokens can be read by scripts or sent over plain HTTP, making session theft and replay attacks straightforward.',
  traversal:
    'An attacker may be able to read sensitive files outside the web root, such as configuration files containing credentials or private keys.',
  subdomain:
    'Forgotten subdomains are often less hardened than production systems and can be used as a stepping-stone into the main application.',
  error:
    'Verbose error messages and stack traces tell an attacker which framework, library versions, and code paths are in use — valuable intelligence for building targeted exploits.',
  access_control:
    'Users may be able to view or modify other users\' data simply by changing an ID in a URL — a very common and impactful vulnerability.',
  rate_limit:
    'Without rate limiting, attackers can brute-force login credentials, enumerate accounts, or flood sensitive endpoints at scale with no friction.',
  // TLS 1.3 is the current standard. TLS 1.2 is still acceptable as a fallback.
  // TLS 1.0 and 1.1 are formally deprecated (RFC 8996) and must not be used.
  tls:
    'Outdated TLS versions (1.0 and 1.1) are formally deprecated and vulnerable to known attacks. Only TLS 1.3 (recommended) and TLS 1.2 (acceptable fallback) should be negotiated.',
  ssl:
    'Outdated TLS versions (1.0 and 1.1) are formally deprecated and vulnerable to known attacks. Only TLS 1.3 (recommended) and TLS 1.2 (acceptable fallback) should be negotiated.',
};

function whyItMattersForFinding(finding) {
  const category = String(finding?.category || 'other').toLowerCase();
  const headerHint = getHeaderHintForTitle(finding?.title);

  if (headerHint && HEADER_IMPACTS[headerHint.header]) return HEADER_IMPACTS[headerHint.header];

  return CATEGORY_IMPACTS[category]
    || 'If real, this finding makes the application easier to attack or harder to defend.';
}

// ---------------------------------------------------------------------------
// How to fix each category — shown in "How to fix" and "How to verify"
// ---------------------------------------------------------------------------

function remediationForCategory(category) {
  const c = String(category || '').toLowerCase();

  const fixes = {
    xss: {
      fix: 'Encode/escape all untrusted data before rendering it in HTML (use your framework\'s templating, not raw concatenation). Validate and reject unexpected input on the server. Add a strict Content-Security-Policy header to limit where scripts can execute.',
      verify: 'Re-run the scan and confirm the injected payload is not reflected in the response. Also test manually using browser DevTools.',
    },
    sqli: {
      fix: 'Use parameterised queries or a well-tested ORM for every database interaction — never concatenate user input into SQL strings. Apply input validation as a secondary defence.',
      verify: 'Re-run the scan and confirm the test payload no longer triggers SQL-like error messages in the response.',
    },
    headers: {
      fix: 'Add missing security headers at your reverse proxy, web server, or CDN (Nginx, Apache, Cloudflare, or a library like Helmet for Node.js). Each header needs only one line of configuration.',
      verify: 'Run `curl -I <url>` or check response headers in browser DevTools → Network and confirm all required headers are present.',
    },
    cookies: {
      fix: 'Set all session and authentication cookies with HttpOnly (prevents script access), Secure (HTTPS only), and an appropriate SameSite policy (Lax or Strict). Never store sensitive secrets in cookies readable by JavaScript.',
      verify: 'Inspect the Set-Cookie response header in DevTools and confirm HttpOnly, Secure, and SameSite are present.',
    },
    traversal: {
      fix: 'Never map user-controlled input directly to filesystem paths. Use a fixed base directory, normalise the resolved path, and confirm it still starts with your intended base before opening any file. Prefer mapping user input to an allow-list of known safe paths.',
      verify: 'Confirm that traversal payloads (e.g. `../../etc/passwd`) return a 400 or a safe fallback, not file content.',
    },
    subdomain: {
      fix: 'Audit the discovered subdomain: determine whether it should be public, and if so, ensure it is properly secured (authentication, up-to-date software, CSP, etc.). Retire and remove any subdomains that are no longer needed.',
      verify: 'Confirm the host is intentionally public and protected to the same standard as your primary domain.',
    },
    error: {
      fix: 'Disable verbose errors and stack traces in production builds. Show users a generic error message and log the full detail server-side only (to a log aggregator, not the HTTP response).',
      verify: 'Trigger error conditions deliberately (invalid input, missing routes) and confirm the response contains no stack traces, file paths, or framework version strings.',
    },
    access_control: {
      fix: 'Enforce an authorisation check server-side for every object/resource access — never trust IDs supplied by the client. Implement ownership checks (does this user own this record?) before returning or modifying any data.',
      verify: 'Repeat the probe the scanner used (change the numeric ID in the URL) as a non-owner and confirm the server returns 403/404, not the other user\'s data.',
    },
    rate_limit: {
      fix: 'Apply rate limiting or request throttling to sensitive endpoints (login, password reset, registration, API keys). Return HTTP 429 with a Retry-After header when the limit is reached. Consider progressive delays or CAPTCHA for repeated failures.',
      verify: 'Send a burst of requests to the same endpoint and confirm you receive HTTP 429 responses after the limit is exceeded.',
    },
    ssl: {
      // TLS 1.3 is the gold standard (RFC 8446, 2018). TLS 1.2 is acceptable.
      // TLS 1.0 and TLS 1.1 were formally deprecated by RFC 8996 (2021).
      fix: 'Configure your server to support TLS 1.3 (recommended) and TLS 1.2 (acceptable fallback) only. Explicitly disable TLS 1.0 and TLS 1.1 at your load balancer or web server. Use strong cipher suites and ensure the certificate is valid, not self-signed, and issued for the correct hostname.',
      verify: 'Run `openssl s_client -connect <host>:443` and confirm the negotiated protocol is TLSv1.3 or TLSv1.2. You can also use ssllabs.com for a detailed scan.',
    },
    tls: {
      fix: 'Configure your server to support TLS 1.3 (recommended) and TLS 1.2 (acceptable fallback) only. Explicitly disable TLS 1.0 and TLS 1.1 at your load balancer or web server. Use strong cipher suites and ensure the certificate is valid, not self-signed, and issued for the correct hostname.',
      verify: 'Run `openssl s_client -connect <host>:443` and confirm the negotiated protocol is TLSv1.3 or TLSv1.2. You can also use ssllabs.com for a detailed scan.',
    },
  };

  return fixes[c] || {
    fix: 'Review the evidence, confirm the finding is real in your environment, then apply the appropriate code or configuration change to remove the root cause.',
    verify: 'Re-run the scan and confirm the finding no longer appears.',
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function safeText(value, maxLen) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '\u2026';
}

// ---------------------------------------------------------------------------
// Main export — builds the local (non-AI) explanation shown in the UI
// ---------------------------------------------------------------------------

export function localAssistantExplanation(scan, finding) {
  const friendlyTitle = displayFindingTitle(finding) || safeText(finding?.title, 200) || 'Finding';
  const severity      = String(finding?.severity || 'info').toUpperCase();
  const category      = String(finding?.category || 'other').toLowerCase();

  const headerHint  = getHeaderHintForTitle(finding?.title);
  const remediation = remediationForCategory(category);
  const whyMatters  = whyItMattersForFinding(finding);

  const sections = [];

  // ── Header line
  sections.push(`[${severity}]  ${friendlyTitle}`);

  // ── What it means
  sections.push('## What it means');
  if (headerHint?.meaning) {
    sections.push(`This finding relates to the ${headerHint.header} HTTP response header.`);
    sections.push(headerHint.meaning);
  } else if (finding?.description) {
    sections.push(safeText(finding.description, 700));
  } else {
    sections.push(`The scanner detected a potential ${category.replace(/_/g, ' ')} issue on the target.`);
  }

  // ── Why it matters
  sections.push('## Why it matters');
  sections.push(whyMatters);

  // ── How to fix
  sections.push('## How to fix');
  sections.push(remediation.fix);

  // ── How to verify
  sections.push('## How to verify');
  sections.push(remediation.verify);

  // ── Evidence (if available)
  if (finding?.evidence) {
    sections.push('## Evidence (from the scan)');
    sections.push(safeText(finding.evidence, 900));
  }

  // ── Target
  if (scan?.targetUrl) {
    sections.push('## Scanned target');
    sections.push(safeText(scan.targetUrl, 300));
  }

  return sections.join('\n\n');
}

export async function assistantChat({ scan, finding }) {
  try {
    return {
      usedAI:    false,
      assistant: { role: 'assistant', content: localAssistantExplanation(scan, finding) },
    };
  } catch {
    return {
      usedAI:    false,
      assistant: {
        role:    'assistant',
        content: 'Could not generate an explanation for this finding. Try again, or review the Description and Evidence sections directly.',
      },
    };
  }
}
