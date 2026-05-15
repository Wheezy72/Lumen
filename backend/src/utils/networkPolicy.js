import dns from 'node:dns/promises';
import net from 'node:net';

const parseList = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const isSuffixMatch = (host, item) => host === item || host.endsWith(`.${item}`);

const parseIpv4 = (ip) => {
  const parts = String(ip).split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return parts;
};

const isPrivateOrSpecialIpv4 = (ip) => {
  const p = parseIpv4(ip);
  if (!p) return false;
  const [a, b] = p;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
};

const isPrivateOrSpecialIpv6 = (ip) => {
  const h = String(ip).toLowerCase();
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true;
  if (h.startsWith('::ffff:127.')) return true;
  return false;
};

const isBlockedHostName = (host) => {
  const h = String(host || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  return false;
};

const normalizeHttpUrl = (raw, fieldName) => {
  let parsed;
  try {
    parsed = new URL(String(raw || ''));
  } catch {
    const err = new Error(`${fieldName} must be a valid URL.`);
    err.status = 400;
    throw err;
  }

  const protocol = String(parsed.protocol || '').toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    const err = new Error(`${fieldName} must use http or https.`);
    err.status = 400;
    throw err;
  }

  if (parsed.username || parsed.password) {
    const err = new Error(`${fieldName} must not include embedded credentials.`);
    err.status = 400;
    throw err;
  }

  return parsed;
};

const assertHostAllowed = (host, { fieldName, allowlist, blocklist }) => {
  if (isBlockedHostName(host)) {
    const err = new Error(`${fieldName} host is not allowed.`);
    err.status = 400;
    throw err;
  }

  if (blocklist.length && blocklist.some((item) => isSuffixMatch(host, item))) {
    const err = new Error(`${fieldName} host is blocked by policy.`);
    err.status = 400;
    throw err;
  }

  if (allowlist.length && !allowlist.some((item) => isSuffixMatch(host, item))) {
    const err = new Error(`${fieldName} host is not allowlisted.`);
    err.status = 400;
    throw err;
  }
};

const resolveHostAddresses = async (host) => {
  const ipVersion = net.isIP(host);
  if (ipVersion) return [host];
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  return addresses.map((item) => item.address);
};

const assertAddressPolicy = async (host, { fieldName, allowPrivate }) => {
  if (allowPrivate) return;
  const addresses = await resolveHostAddresses(host);

  if (!addresses.length) {
    const err = new Error(`${fieldName} host could not be resolved.`);
    err.status = 400;
    throw err;
  }

  for (const ip of addresses) {
    const version = net.isIP(ip);
    if (version === 4 && isPrivateOrSpecialIpv4(ip)) {
      const err = new Error(`${fieldName} resolves to a private or special network address.`);
      err.status = 400;
      throw err;
    }
    if (version === 6 && isPrivateOrSpecialIpv6(ip)) {
      const err = new Error(`${fieldName} resolves to a private or special network address.`);
      err.status = 400;
      throw err;
    }
  }
};

const validateNetworkUrl = async (
  rawUrl,
  {
    fieldName,
    allowPrivateEnv = 'ALLOW_PRIVATE_TARGETS',
    allowlistEnv = 'SCAN_TARGET_ALLOWLIST',
    blocklistEnv = 'SCAN_BLOCKED_HOSTS',
  },
) => {
  const parsed = normalizeHttpUrl(rawUrl, fieldName);
  const host = parsed.hostname.toLowerCase();

  const allowPrivate = String(process.env[allowPrivateEnv] || '').toLowerCase() === 'true';
  const allowlist = parseList(process.env[allowlistEnv]);
  const blocklist = parseList(process.env[blocklistEnv]);

  assertHostAllowed(host, { fieldName, allowlist, blocklist });
  await assertAddressPolicy(host, { fieldName, allowPrivate });

  return parsed.toString();
};

export const extractTargetHost = (targetUrl) => {
  const parsed = normalizeHttpUrl(targetUrl, 'Target URL');
  return parsed.host.toLowerCase();
};

export const validateScanTargetUrl = async (targetUrl) => validateNetworkUrl(targetUrl, {
  fieldName: 'Target URL',
  allowPrivateEnv: 'ALLOW_PRIVATE_TARGETS',
  allowlistEnv: 'SCAN_TARGET_ALLOWLIST',
  blocklistEnv: 'SCAN_BLOCKED_HOSTS',
});

export const validateWebhookUrl = async (webhookUrl) => validateNetworkUrl(webhookUrl, {
  fieldName: 'Webhook URL',
  allowPrivateEnv: 'ALLOW_PRIVATE_WEBHOOKS',
  allowlistEnv: 'WEBHOOK_TARGET_ALLOWLIST',
  blocklistEnv: 'WEBHOOK_BLOCKED_HOSTS',
});
