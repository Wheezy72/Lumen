function safeText(value, maxLen) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

const HEADER_HINTS = {
  'X-Frame-Options': 'Stops other sites from embedding your pages (clickjacking defense).',
  'X-Content-Type-Options': 'Prevents browsers from guessing file types (reduces some injection risks).',
  'Referrer-Policy': 'Controls how much URL info is shared when users navigate away.',
  'Strict-Transport-Security': 'Forces HTTPS (helps prevent downgrade attacks).',
  'Content-Security-Policy': 'Restricts where scripts/styles can load from (reduces XSS impact).',
};

const HEADER_IMPACTS = {
  'X-Frame-Options': 'Without it, attackers may be able to trick users into clicking invisible UI (clickjacking).',
  'X-Content-Type-Options': 'Without it, browsers may treat files as a different type, enabling some injection attacks.',
  'Referrer-Policy': 'Without it, sensitive URL details can leak to third parties via the Referrer header.',
  'Strict-Transport-Security': 'Without it, users can be downgraded to HTTP, increasing the risk of interception/injection.',
  'Content-Security-Policy': 'Without it, many XSS payloads are easier to execute and harder to contain.',
};

const CATEGORY_IMPACTS = {
  xss: 'Attackers may run JavaScript in users’ browsers (session theft, account takeover).',
  sqli: 'Attackers may read/modify database data or bypass authentication.',
  headers: 'Missing headers remove browser-level protections that reduce exploit impact.',
  cookies: 'Weak cookie flags make session theft and replay attacks easier.',
  traversal: 'Attackers may read sensitive files or access unintended server paths.',
  subdomain: 'Forgotten hosts are often weaker and can be used as a stepping stone into production.',
  error: 'Verbose errors leak internal details that help attackers craft reliable exploits.',
  access_control: 'Users may access other users’ data or perform actions they shouldn’t.',
  rate_limit: 'Attackers can brute-force passwords or spam sensitive endpoints at high volume.',
  tls: 'Weak TLS settings can allow interception or downgrade attacks.',
  ssl: 'Weak TLS settings can allow interception or downgrade attacks.',
};

function headerMeaningFromTitle(title = '') {
  const raw = String(title || '');
  const match = raw.match(/^Missing security header:\s*(.+)$/i);
  if (!match) return null;

  const header = match[1].trim();
  const meaning = HEADER_HINTS[header];
  if (!meaning) return null;

  return { header, meaning, impact: HEADER_IMPACTS[header] };
}

function whyItMattersForFinding(finding) {
  const category = String(finding?.category || 'other').toLowerCase();
  const headerMeaning = headerMeaningFromTitle(finding?.title);

  if (headerMeaning?.impact) return headerMeaning.impact;

  return CATEGORY_IMPACTS[category]
    || 'If real, this can make the application easier to attack or harder to defend.';
}

function remediationForCategory(category) {
  const c = String(category || '').toLowerCase();

  const fixes = {
    xss: {
      fix: 'Encode/escape untrusted output, validate input, and add a strict Content-Security-Policy.',
      verify: 'Re-run the scan and confirm the injected payload is not reflected/executed.',
    },
    sqli: {
      fix: 'Use parameterized queries/ORM and avoid string concatenation in SQL.',
      verify: 'Re-run the scan and confirm the test payload no longer triggers SQL-like behavior/errors.',
    },
    headers: {
      fix: 'Add missing security headers at your reverse proxy/web server (Helmet, Nginx, Apache, CDN).',
      verify: 'Check response headers in DevTools or curl and confirm the headers are present.',
    },
    cookies: {
      fix: 'Set session cookies with HttpOnly + Secure + SameSite, and avoid storing secrets in client-readable cookies.',
      verify: 'Inspect Set-Cookie headers and confirm flags are present.',
    },
    traversal: {
      fix: 'Never map user input directly to filesystem paths; normalize + allow-list paths.',
      verify: 'Confirm traversal payloads no longer return sensitive files.',
    },
    subdomain: {
      fix: 'Audit the discovered subdomain; remove exposure or add authentication / IP allow-listing.',
      verify: 'Confirm the host is intended to be public and protected appropriately.',
    },
    error: {
      fix: 'Disable verbose errors/stack traces in production; log details server-side only.',
      verify: 'Trigger errors and confirm responses are generic.',
    },
    access_control: {
      fix: 'Enforce authorization checks server-side for every object/resource (do not trust IDs from the client).',
      verify: 'Try the same ID changes as the scan; access should be denied.',
    },
    rate_limit: {
      fix: 'Add rate limiting/throttling to sensitive endpoints (login, password reset).',
      verify: 'Send bursts of requests and confirm 429/Retry-After behavior.',
    },
    ssl: {
      fix: 'Use TLS 1.2+ only, keep certificates valid, and use modern ciphers.',
      verify: 'Re-run the scan and confirm TLS checks pass.',
    },
    tls: {
      fix: 'Use TLS 1.2+ only, keep certificates valid, and use modern ciphers.',
      verify: 'Re-run the scan and confirm TLS checks pass.',
    },
  };

  return fixes[c] || {
    fix: 'Review the evidence, confirm the finding, then apply an appropriate code/config change.',
    verify: 'Re-run the scan and confirm the finding is gone.',
  };
}

export function localAssistantExplanation(scan, finding) {
  const title = safeText(finding?.title, 200) || 'Finding';
  const severity = String(finding?.severity || 'info').toUpperCase();
  const category = String(finding?.category || 'other').toLowerCase();

  const headerMeaning = headerMeaningFromTitle(finding?.title);
  const remediation = remediationForCategory(category);

  const lines = [];
  lines.push(`${severity}: ${title}`);

  lines.push('');
  lines.push('What it means');
  if (headerMeaning) {
    lines.push(`- Missing header: ${headerMeaning.header}`);
    lines.push(`- ${headerMeaning.meaning}`);
  } else if (finding?.description) {
    lines.push(`- ${safeText(finding.description, 700)}`);
  } else {
    lines.push(`- The scanner flagged a potential ${category.replace(/_/g, ' ')} issue.`);
  }

  lines.push('');
  lines.push('Why it matters');
  lines.push(`- ${whyItMattersForFinding(finding)}`);

  lines.push('');
  lines.push('How to fix');
  lines.push(`- ${remediation.fix}`);

  lines.push('');
  lines.push('How to verify');
  lines.push(`- ${remediation.verify}`);

  if (finding?.evidence) {
    lines.push('');
    lines.push('Evidence (from the scan)');
    lines.push(safeText(finding.evidence, 900));
  }

  const target = scan?.targetUrl ? safeText(scan.targetUrl, 300) : null;
  if (target) {
    lines.push('');
    lines.push(`Target: ${target}`);
  }

  return lines.join('\n');
}

export async function assistantChat({ scan, finding }) {
  try {
    return {
      usedAI: false,
      assistant: { role: 'assistant', content: localAssistantExplanation(scan, finding) },
    };
  } catch {
    return {
      usedAI: false,
      assistant: {
        role: 'assistant',
        content: 'Could not generate an explanation for this finding. Try again, or view the Description and Evidence sections.',
      },
    };
  }
}
