import { describe, expect, it, vi } from 'vitest';

import { retryWithBackoff } from '../lib/retry';

const createRetryableError = (message: string, retryable = true): Error & { retryable: boolean } => {
  const error = new Error(message) as Error & { retryable: boolean };
  error.retryable = retryable;
  return error;
};

describe('retryWithBackoff', () => {
  it('retries with exponential backoff and jitter within bounds', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // jitter factor = 1
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const fn = vi
      .fn()
      .mockRejectedValueOnce(createRetryableError('fail-1'))
      .mockRejectedValueOnce(createRetryableError('fail-2'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      retries: 3,
      minMs: 100,
      maxMs: 800,
      factor: 2,
      jitter: 0,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toEqual([100, 200]);

    setTimeoutSpy.mockRestore();
    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('stops retrying on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(createRetryableError('non-retryable', false));

    await expect(
      retryWithBackoff(fn, { retries: 5, minMs: 50, maxMs: 100 }),
    ).rejects.toThrow('non-retryable');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
