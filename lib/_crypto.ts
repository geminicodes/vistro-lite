'use server';

/** @module _crypto */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * TOKEN_ENC_KEY must be a base64 encoded 32-byte string.
 *
 * Dev helpers to generate a key:
 *   - openssl rand -base64 32
 *   - node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

function parseKey(base64Key: string): Buffer {
  const normalizedKey = base64Key.replace(/\s+/g, '');

  if (!normalizedKey) {
    throw new Error('Encryption key must be a non-empty base64 string.');
  }

  if (!BASE64_PATTERN.test(normalizedKey)) {
    throw new Error('Encryption key must contain only base64 characters.');
  }

  const keyBuffer = Buffer.from(normalizedKey, 'base64');

  if (keyBuffer.length !== KEY_BYTE_LENGTH) {
    throw new Error(
      `Encryption key must decode to ${KEY_BYTE_LENGTH} bytes. Received ${keyBuffer.length} bytes.`,
    );
  }

  return keyBuffer;
}

/**
 * Ensures the provided base64-encoded key decodes to 32 bytes.
 *
 * @example
 * ```ts
 * validateKey(process.env.TOKEN_ENC_KEY ?? '');
 * ```
 *
 * @throws {Error} When the key is empty, not valid base64, or not 32 bytes.
 */
export function validateKey(base64Key: string): void {
  parseKey(base64Key);
}

/**
 * Encrypts a JSON-serializable value with AES-256-GCM.
 *
 * The result is a string composed of three base64 segments: `iv.tag.cipher`.
 *
 * @example
 * ```ts
 * const encrypted = encryptJSON(
 *   { userId: '123', scope: ['read'] },
 *   process.env.TOKEN_ENC_KEY ?? '',
 * );
 * ```
 *
 * @param obj - A JSON-serializable value.
 * @param base64Key - Base64-encoded 32-byte encryption key.
 * @returns The encrypted payload formatted as `iv.tag.cipher`.
 *
 * @throws {Error} When the key is invalid or the object cannot be serialized.
 */
export function encryptJSON(obj: unknown, base64Key: string): string {
  const key = parseKey(base64Key);
  let plaintext: string;

  try {
    plaintext = JSON.stringify(obj);
  } catch (error) {
    throw new Error('Failed to serialize object for encryption.');
  }

  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ivBase64 = iv.toString('base64');
  const tagBase64 = authTag.toString('base64');
  const cipherBase64 = ciphertext.toString('base64');

  return `${ivBase64}.${tagBase64}.${cipherBase64}`;
}

/**
 * Decrypts an `iv.tag.cipher` payload created by {@link encryptJSON}.
 *
 * @example
 * ```ts
 * const payload = decryptJSON<{ userId: string }>(
 *   encryptedToken,
 *   process.env.TOKEN_ENC_KEY ?? '',
 * );
 * ```
 *
 * @param payload - The encrypted string formatted as `iv.tag.cipher`.
 * @param base64Key - Base64-encoded 32-byte encryption key.
 *
 * @returns The decrypted value, parsed from JSON.
 *
 * @throws {Error} When the key is invalid, payload is malformed, or decryption fails.
 */
export function decryptJSON<T = unknown>(payload: string, base64Key: string): T {
  const key = parseKey(base64Key);
  const segments = payload.split('.');

  if (segments.length !== 3) {
    throw new Error('Encrypted payload must contain three base64 segments separated by ".".');
  }

  const [ivBase64, tagBase64, cipherBase64] = segments;

  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(tagBase64, 'base64');
    const ciphertext = Buffer.from(cipherBase64, 'base64');

    if (iv.length !== IV_BYTE_LENGTH) {
      throw new Error(`Initialization vector must be ${IV_BYTE_LENGTH} bytes.`);
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse decrypted payload as JSON.');
    }

    if (error instanceof Error) {
      throw new Error(`Failed to decrypt payload: ${error.message}`);
    }

    throw new Error('Failed to decrypt payload due to an unknown error.');
  }
}
