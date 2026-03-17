import { chatCompletion, isAiConfigured } from './ai.js';

function safeText(value, maxLen) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

export function buildAssistantContext(scan, finding) {
  const parts = [
    `Target: ${safeText(scan?.targetUrl, 300)}`,
    `Severity: ${safeText(finding?.severity, 30)}`,
    `Category: ${safeText(finding?.category, 50)}`,
    `Title: ${safeText(finding?.title, 300)}`,
  ];

  if (finding?.description) parts.push(`Description: ${safeText(finding.description, 800)}`);
  if (finding?.evidence) parts.push(`Evidence: ${safeText(finding.evidence, 800)}`);
  if (finding?.cve) parts.push(`CVE: ${safeText(finding.cve, 40)}`);
  if (typeof finding?.epss !== 'undefined') parts.push(`EPSS: ${safeText(finding.epss, 40)}`);

  return parts.join('\n');
}

export function fallbackAssistantAnswer(scan, finding, question) {
  const title = safeText(finding?.title, 200) || 'Finding';
  const category = String(finding?.category || '').toLowerCase();
  const severity = String(finding?.severity || 'info').toUpperCase();

  const baseline =
    `(${severity}) ${title}\n\n` +
    `What it means: This is an automated finding from the ${category || 'general'} checks.\n` +
    `Why it matters: It may increase the risk of data exposure or account compromise if it is real.\n\n`;

  const fixes = {
    xss: 'Fix: HTML-encode untrusted output, validate input, and add a strict Content-Security-Policy. Verify by re-running the scan and confirming the payload is not reflected.',
    sqli: 'Fix: Use parameterized queries/ORM, validate input, and remove error leakage. Verify by re-running the scan and confirming no SQL error behavior.',
    headers: 'Fix: Add missing security headers (CSP, X-Frame-Options, HSTS, etc.) at your web server/reverse proxy. Verify by checking response headers in DevTools/curl.',
    cookies: 'Fix: Set HttpOnly + Secure + SameSite on session cookies. Verify in the Set-Cookie header.',
    traversal: 'Fix: Normalize paths, use allow-lists, and never map user input directly to filesystem paths. Verify traversal payloads do not access sensitive files.',
    access_control: 'Fix: Enforce authorization checks server-side for every object/resource. Verify by attempting the same ID changes as the scanner.',
    rate_limit: 'Fix: Add rate limiting / throttling to sensitive endpoints (login, password reset). Verify by sending bursts and expecting 429/Retry-After.',
    ssl: 'Fix: Enable TLS 1.2+ only, use a valid certificate, and modern ciphers. Verify via browser/security scanner.',
    tls: 'Fix: Enable TLS 1.2+ only, use a valid certificate, and modern ciphers. Verify via browser/security scanner.',
    subdomain: 'Fix: Review the discovered subdomain; remove exposure or enforce auth. Verify via DNS and access controls.',
    error: 'Fix: Disable verbose errors/stack traces in production; log server-side only. Verify by triggering errors and checking responses.',
  };

  const fix = fixes[category] || 'Fix: Review the evidence, confirm the finding, then apply an appropriate code/config change. Verify by re-running the scan.';

  if (!question) return baseline + fix;

  return (
    baseline +
    fix +
    `\n\nQuestion: ${safeText(question, 400)}\n` +
    'Answer: AI is not configured on this server, so this is a best-effort built-in explanation. If you enable AI_API_KEY, I can answer in more detail.'
  );
}

export async function assistantChat({ scan, finding, messages }) {
  const system =
    'You are Lumen Assistant, a web application security helper. ' +
    'Explain findings from automated scans for developers/students. ' +
    'Be practical and concise. Provide: what it is, why it matters, how to fix, how to verify. ' +
    'If evidence is weak, say so. Do not invent details.';

  const context = buildAssistantContext(scan, finding);

  if (!isAiConfigured()) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
    return {
      usedAI: false,
      assistant: { role: 'assistant', content: fallbackAssistantAnswer(scan, finding, lastUser) },
    };
  }

  const assistantText = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'system', content: context },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    { temperature: 0.2, maxTokens: 600 },
  );

  return {
    usedAI: true,
    assistant: { role: 'assistant', content: assistantText },
  };
}
