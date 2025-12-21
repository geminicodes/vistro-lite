import { describe, expect, it } from 'vitest';

import { decryptJSON, encryptJSON, validateKey } from '../lib/_crypto';

const createTestKey = (): string => {
  const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  return Buffer.from(keyBytes).toString('base64');
};

describe('crypto helpers', () => {
  it('encrypts then decrypts a JSON value', () => {
    const base64Key = createTestKey();
    const original = {
      foo: 'bar',
      nested: { count: 42, enabled: true },
      list: ['a', 'b', 'c'],
    };

    const payload = encryptJSON(original, base64Key);
    const decrypted = decryptJSON<typeof original>(payload, base64Key);

    expect(decrypted).toStrictEqual(original);
  });

  it('rejects invalid key lengths', () => {
    const invalidKey = Buffer.from('short key').toString('base64');

    expect(() => validateKey(invalidKey)).toThrow(/32 bytes/);
  });
});
