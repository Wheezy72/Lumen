import crypto from 'crypto';
import fetch from 'node-fetch';

function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

// Password validation for registration and password reset.
//
// Implements:
// - Minimum length: 12
// - Complexity: upper, lower, number, special
// - Blocks common passwords (top 10k) via a configurable source
// - Checks HaveIBeenPwned (k-anonymity) via pwnedpasswords "range" API
//
// Common password list source:
// - By default, we try to download the SecLists 10k list once per process.
// - For offline / air-gapped deployments, set COMMON_PASSWORDS_FILE to a newline-separated list.
//
// HIBP API docs: https://haveibeenpwned.com/API/v3#PwnedPasswords

const {
  PWNED_PASSWORDS_CHECK = 'true',
  COMMON_PASSWORDS_URL = 'https://gitlab.com/kalilinux/packages/seclists/-/raw/kali/master/Passwords/Common-Credentials/10k-most-common.txt',
  COMMON_PASSWORDS_FILE,
} = process.env;

const MIN_LENGTH = 12;

const hasLower = (s) => /[a-z]/.test(s);
const hasUpper = (s) => /[A-Z]/.test(s);
const hasNumber = (s) => /\d/.test(s);
// Require at least one non-alphanumeric character.
const hasSpecial = (s) => /[^a-zA-Z0-9]/.test(s);

let _commonPasswordsPromise = null;
let _commonPasswords = null; // Set<string>

const _pwnedPrefixCache = new Map(); // prefix -> Set(suffix)

async function loadCommonPasswords() {
  if (_commonPasswords) return _commonPasswords;
  if (_commonPasswordsPromise) return _commonPasswordsPromise;

  _commonPasswordsPromise = (async () => {
    let text = '';

    if (COMMON_PASSWORDS_FILE) {
      // Lazy import so environments without fs still run (e.g. serverless bundling).
      const fs = await import('fs');
      text = fs.readFileSync(COMMON_PASSWORDS_FILE, 'utf8');
    } else {
      // Best-effort download. If it fails, we still rely on HIBP + other rules.
      const resp = await fetchWithTimeout(
        COMMON_PASSWORDS_URL,
        {
          headers: {
            // Avoid caching surprises.
            'Cache-Control': 'no-cache',
          },
        },
        8000,
      );
      if (!resp.ok) {
        throw new Error(`Failed to load common password list: HTTP ${resp.status}`);
      }
      text = await resp.text();
    }

    const set = new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.toLowerCase()),
    );

    _commonPasswords = set;
    return set;
  })();

  return _commonPasswordsPromise;
}

function sha1HexUpper(input) {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase();
}

async function isPwnedPassword(password) {
  const full = sha1HexUpper(password);
  const prefix = full.slice(0, 5);
  const suffix = full.slice(5);

  let suffixes = _pwnedPrefixCache.get(prefix);
  if (!suffixes) {
    const resp = await fetchWithTimeout(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          // Recommended by HIBP to mitigate enumeration/timing.
          'Add-Padding': 'true',
        },
      },
      8000,
    );
    if (!resp.ok) {
      throw new Error(`HIBP range API failed: HTTP ${resp.status}`);
    }

    const body = await resp.text();
    suffixes = new Set(
      body
        .split(/\r?\n/)
        .map((line) => line.split(':')[0]?.trim())
        .filter(Boolean),
    );

    _pwnedPrefixCache.set(prefix, suffixes);
  }

  return suffixes.has(suffix);
}

export async function validatePassword(password) {
  const errors = [];

  if (typeof password !== 'string') {
    return { ok: false, errors: ['Password must be a string.'] };
  }

  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters.`);
  }
  if (!hasLower(password)) errors.push('Password must include a lowercase letter.');
  if (!hasUpper(password)) errors.push('Password must include an uppercase letter.');
  if (!hasNumber(password)) errors.push('Password must include a number.');
  if (!hasSpecial(password)) errors.push('Password must include a special character.');

  // Common password check (best effort).
  try {
    const common = await loadCommonPasswords();
    if (common.has(password.toLowerCase())) {
      errors.push('Password is too common. Choose a less common password.');
    }
  } catch {
    // Do not block signup if list cannot be loaded.
  }

  // HIBP check (best effort, configurable).
  if (PWNED_PASSWORDS_CHECK.toLowerCase() === 'true') {
    try {
      if (await isPwnedPassword(password)) {
        errors.push('Password has appeared in data breaches. Choose a different password.');
      }
    } catch {
      // Do not block signup if HIBP is unreachable.
    }
  }

  return { ok: errors.length === 0, errors };
}
