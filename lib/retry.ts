'use server';

export interface RetryOptions {
  retries: number;
  minMs: number;
  maxMs: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isNonRetryable = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'retryable' in error && !(error as any).retryable);

const getRetryAfterMs = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = (error as any).retryAfterMs;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
};

const computeDelay = (attempt: number, minMs: number, maxMs: number): number => {
  const baseDelay = Math.min(maxMs, minMs * 2 ** attempt);
  const jitterFactor = 1 + Math.random(); // between 1x and 2x
  return Math.min(maxMs, Math.round(baseDelay * jitterFactor));
};

export const retryWithBackoff = async <T>(
  fn: (attempt: number) => Promise<T>,
  { retries, minMs, maxMs, onRetry }: RetryOptions,
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;
  const maxAttempts = Math.max(0, retries);

  while (attempt <= maxAttempts) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (isNonRetryable(error) || attempt === maxAttempts) {
        throw error;
      }

      lastError = error;
      const retryAfterMs = getRetryAfterMs(error);
      const delay = retryAfterMs === null ? computeDelay(attempt, minMs, maxMs) : Math.min(maxMs, retryAfterMs);

      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Operation failed after retries with unknown error.');
};
