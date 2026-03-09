import crypto from 'crypto';
import { authenticator } from 'otplib';

const {
  TOTP_ISSUER = 'Lumen Scanner',
  TOTP_ENCRYPTION_KEY,
} = process.env;

function getKey() {
  if (!TOTP_ENCRYPTION_KEY) return null;
  const buf = Buffer.from(TOTP_ENCRYPTION_KEY, 'base64');
  if (buf.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes base64-encoded');
  }
  return buf;
}

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function totpOtpauthUrl({ username, secret }) {
  return authenticator.keyuri(username, TOTP_ISSUER, secret);
}

export function verifyTotp({ token, secret }) {
  return authenticator.verify({ token, secret });
}

export function encryptSecret(secret) {
  const key = getKey();
  if (!key) return secret;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(data) {
  const key = getKey();
  if (!key) return data;

  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
