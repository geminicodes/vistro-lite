'use server';

import { warn } from './log';

export interface RetryOptions {
  retries?: number;
  minMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: number;
  onRetry?: (attempt: number, error: unknown, waitMs: number) => void;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const DEFAULTS = {
  retries: 3,
  minMs: 200,
  maxMs: 3000,
  factor: 2,
  jitter: 0.2,
} as const;

const isNonRetryable = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'retryable' in error && !(error as any).retryable);

const getRetryAfterMs = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = (error as any).retryAfterMs;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const computeDelayMs = (attempt: number, minMs: number, maxMs: number, factor: number, jitter: number): number => {
  const raw = minMs * factor ** (attempt - 1);
  const capped = Math.min(maxMs, raw);

  const j = clampNumber(jitter, 0, 1);
  if (j === 0) {
    return Math.round(capped);
  }

  // Multiply by a uniform jitter window around 1.0.
  // Example: jitter=0.2 => factor in [0.8, 1.2]
  const rand = Math.random(); // deterministic under mocked Math.random in tests
  const multiplier = 1 - j + rand * (2 * j);
  return Math.max(0, Math.round(Math.min(maxMs, capped * multiplier)));
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, opts.retries ?? DEFAULTS.retries);
  const minMs = Math.max(0, opts.minMs ?? DEFAULTS.minMs);
  const maxMs = Math.max(minMs, opts.maxMs ?? DEFAULTS.maxMs);
  const factor = Math.max(1, opts.factor ?? DEFAULTS.factor);
  const jitter = opts.jitter ?? DEFAULTS.jitter;
  const onRetry = opts.onRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isNonRetryable(error) || attempt === retries) {
        throw error;
      }

      const retryAttempt = attempt + 1; // 1-based retry attempt
      const retryAfterMs = getRetryAfterMs(error);
      const waitMs =
        retryAfterMs === null
          ? computeDelayMs(retryAttempt, minMs, maxMs, factor, jitter)
          : Math.round(Math.min(maxMs, retryAfterMs));

      warn('Retrying operation', {
        attempt: retryAttempt,
        waitMs,
        error: error instanceof Error ? error.message : String(error),
      });

      onRetry?.(retryAttempt, error, waitMs);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Operation failed after retries with unknown error.');
}
