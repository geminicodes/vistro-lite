'use server';

import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 digest for the provided UTF-8 string and return it as
 * a lowercase hexadecimal string.
 *
 * @example
 * ```ts
 * const digest = sha256Hex('hello world');
 * // => "b94d27b9934d3e08a52e52d7da7dabfade4f..." (truncated)
 * ```
 *
 * @param input - Source string to hash.
 * @returns Hex-encoded SHA-256 digest.
 */
export const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
