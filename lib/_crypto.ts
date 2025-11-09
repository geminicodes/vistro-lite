import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// This module is intended for server-side usage only.

/**
 * Store your base64-encoded key (32 bytes) securely, for example in the `TOKEN_ENC_KEY`
 * environment variable.
 */
// Generate with: openssl rand -base64 32
// Or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const AUTH_TAG_LENGTH_BYTES = 16;
const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

/**
 * Ensure the supplied base64-encoded encryption key decodes to 32 bytes.
 *
 * @remarks
 * Generate a key once and reuse it:
 * - `openssl rand -base64 32`
 * - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 * Store the resulting value in an environment variable such as `TOKEN_ENC_KEY`.
 *
 * @param base64Key - Base64 string that must decode to 32 bytes.
 *
 * @throws {Error} If the key is missing, not valid base64, or not 32 bytes.
 */
export function validateKey(base64Key: string): void {
  decodeAndValidateKey(base64Key);
}

/**
 * Encrypt a JSON-serialisable value with AES-256-GCM.
 *
 * @example
 * ```ts
 * const key = process.env.TOKEN_ENC_KEY!;
 * const payload = { userId: '123' };
 * const encrypted = encryptJSON(payload, key);
 * const decrypted = decryptJSON<typeof payload>(encrypted, key);
 * ```
 *
 * @param obj - JSON-serialisable data.
 * @param base64Key - Base64 string that must decode to 32 bytes.
 *
 * @returns A single string containing base64-encoded IV, auth tag, and ciphertext separated by dots.
 *
 * @throws {Error} If serialization fails or encryption fails.
 */
export function encryptJSON(obj: unknown, base64Key: string): string {
  const key = decodeAndValidateKey(base64Key);

  let plaintext: Buffer;
  try {
    const json = JSON.stringify(obj);
    if (typeof json !== 'string') {
      throw new Error();
    }
    plaintext = Buffer.from(json, 'utf8');
  } catch {
    throw new Error('Failed to serialise payload for encryption.');
  }

  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((segment) => segment.toString('base64')).join('.');
}

/**
 * Decrypt a payload produced by {@link encryptJSON}.
 *
 * @example
 * ```ts
 * const key = process.env.TOKEN_ENC_KEY!;
 * const token = encryptJSON({ sessionId: 'abc' }, key);
 * const session = decryptJSON<{ sessionId: string }>(token, key);
 * ```
 *
 * @param payload - Dot-separated base64 segments `iv.tag.cipher`.
 * @param base64Key - Base64 string that must decode to 32 bytes.
 *
 * @returns The parsed JSON value.
 *
 * @throws {Error} If the payload is malformed, decryption fails, or parsing fails.
 */
export function decryptJSON<T = unknown>(payload: string, base64Key: string): T {
  const key = decodeAndValidateKey(base64Key);
  const segments = payload.split('.');

  if (segments.length !== 3) {
    throw new Error('Encrypted payload must contain three segments: iv.tag.cipher.');
  }

  const [ivSegment, tagSegment, cipherSegment] = segments;

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;

  try {
    iv = Buffer.from(ivSegment, 'base64');
    authTag = Buffer.from(tagSegment, 'base64');
    ciphertext = Buffer.from(cipherSegment, 'base64');
  } catch {
    throw new Error('Encrypted payload contains invalid base64 segments.');
  }

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`Initialisation vector must be ${IV_LENGTH_BYTES} bytes.`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(`Authentication tag must be ${AUTH_TAG_LENGTH_BYTES} bytes.`);
  }

  if (ciphertext.length === 0) {
    throw new Error('Ciphertext segment is empty or invalid.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Failed to decrypt payload: authentication failed or data is corrupted.');
  }

  try {
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    throw new Error('Failed to parse decrypted payload as JSON.');
  }
}

function decodeAndValidateKey(base64Key: string): Buffer {
  const sanitized = base64Key.replace(/\s+/g, '');

  if (!sanitized) {
    throw new Error('Encryption key is required.');
  }

  if (!BASE64_REGEX.test(sanitized)) {
    throw new Error('Encryption key must be a valid base64 string.');
  }

  const key = Buffer.from(sanitized, 'base64');

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`Encryption key must decode to ${KEY_LENGTH_BYTES} bytes (received ${key.length}).`);
  }

  return key;
}
