import { describe, expect, it } from 'vitest';
import { randomBytes } from 'crypto';

import { decryptJSON, encryptJSON, validateKey } from '../lib/_crypto';

describe('crypto helpers', () => {
  const base64Key = randomBytes(32).toString('base64');

  it('encrypts and decrypts JSON payloads', () => {
    const payload = {
      userId: 'user-123',
      roles: ['editor', 'admin'],
      flags: { beta: true, quota: 5 },
      issuedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
    };

    const token = encryptJSON(payload, base64Key);
    const result = decryptJSON<typeof payload>(token, base64Key);

    expect(result).toEqual(payload);
  });

  it('rejects keys that are not 32 bytes once decoded', () => {
    const shortKey = randomBytes(16).toString('base64');

    expect(() => validateKey(shortKey)).toThrowError(/32 bytes/);
    expect(() => encryptJSON({ ok: true }, shortKey)).toThrowError(/32 bytes/);
  });
});
