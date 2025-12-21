import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translateBatch, translateText } from '../lib/deeplClient';

beforeEach(() => {
  vi.stubEnv('MOCK_DEEPL', 'true');
  vi.stubEnv('DEEPL_MAX_RETRIES', '0');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deeplClient (mock mode)', () => {
  it('translates batches preserving order', async () => {
    const input = ['Hello', 'How are you?', 'Thank you'];
    const result = await translateBatch(input, 'de');

    expect(result).toEqual(['Hello [DE]', 'How are you? [DE]', 'Thank you [DE]']);
  });

  it('translates single text via translateText', async () => {
    const result = await translateText('See you soon', 'es');

    expect(result).toBe('See you soon [ES]');
  });
});
