import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || path.join('logs', 'audit.log');
const AUDIT_LOG_SECRET = process.env.AUDIT_LOG_SECRET || '';

let currentHash = 'GENESIS';
let initialized = false;
let writeChain = Promise.resolve();

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

const ensureInitialized = () => {
  if (initialized) return;
  const absPath = path.resolve(process.cwd(), AUDIT_LOG_FILE);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, '', { encoding: 'utf8' });
  } else {
    const content = fs.readFileSync(absPath, 'utf8').trim();
    if (content) {
      const lastLine = content.split('\n').filter(Boolean).at(-1);
      if (lastLine) {
        try {
          const parsed = JSON.parse(lastLine);
          if (parsed?.hash) currentHash = String(parsed.hash);
        } catch {
          currentHash = 'GENESIS';
        }
      }
    }
  }
  initialized = true;
};

const computeHash = (prevHash, payload) => {
  const body = `${prevHash}\n${payload}`;
  if (AUDIT_LOG_SECRET) {
    return crypto.createHmac('sha256', AUDIT_LOG_SECRET).update(body).digest('hex');
  }
  return crypto.createHash('sha256').update(body).digest('hex');
};

export const writeAuditEvent = async (event) => {
  const writeOne = async () => {
    ensureInitialized();

    const absPath = path.resolve(process.cwd(), AUDIT_LOG_FILE);
    const payload = {
      ts: new Date().toISOString(),
      ...event,
    };

    const canonical = stableStringify(payload);
    const hash = computeHash(currentHash, canonical);
    const record = { ...payload, prevHash: currentHash, hash };

    await fs.promises.appendFile(absPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
    currentHash = hash;
  };

  writeChain = writeChain.then(writeOne, writeOne);
  return writeChain;
};
