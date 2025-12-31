'use server';

import { warn } from './log';
import { retryWithBackoff } from './retry';

const DEFAULT_BASE_URL = 'https://api-free.deepl.com/v2/translate';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_TEXTS_PER_REQUEST = 50;
const DEFAULT_USER_AGENT = 'vistro-lite/0.1 (+https://example.invalid)';

interface DeepLConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  isMock: boolean;
  userAgent: string;
}

interface DeepLTranslationResponse {
  translations: Array<{ text: string }>;
}

const normalizeTargetLang = (targetLang: string): string => {
  const normalized = targetLang.trim().toUpperCase();

  if (!normalized) {
    throw new Error('targetLang must be a non-empty string.');
  }

  return normalized;
};

const parseIntegerEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

const getConfig = (): DeepLConfig => {
  const isMock = (process.env.MOCK_DEEPL ?? '').toLowerCase() === 'true';
  const baseUrl = process.env.DEEPL_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const timeoutMs = parseIntegerEnv(process.env.DEEPL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxRetries = parseIntegerEnv(process.env.DEEPL_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const apiKey = process.env.DEEPL_API_KEY?.trim() ?? '';
  const userAgent = process.env.DEEPL_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  if (!isMock && !apiKey) {
    throw new Error('DEEPL_API_KEY must be set unless MOCK_DEEPL=true.');
  }

  return {
    apiKey,
    baseUrl,
    timeoutMs,
    maxRetries,
    isMock,
    userAgent,
  };
};

const shouldRetryStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status < 600);

const parseRetryAfterMs = (headerValue: string | null | undefined): number | null => {
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }

  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  // Retry-After may also be a HTTP date.
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
};

const buildRequestBody = (texts: string[], targetLang: string): URLSearchParams => {
  const params = new URLSearchParams();
  params.append('target_lang', targetLang);

  for (const text of texts) {
    params.append('text', text);
  }

  return params;
};

const requestDeepLChunk = async (
  texts: string[],
  targetLang: string,
  config: DeepLConfig,
): Promise<string[]> => {
  if (config.isMock) {
    return texts.map((text) => `${text} [${targetLang}]`);
  }

  const { apiKey, baseUrl, timeoutMs, maxRetries, userAgent } = config;

  const executeRequest = async (attempt: number): Promise<string[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const body = buildRequestBody(texts, targetLang);

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        const error = new Error(
          `DeepL request failed with status ${response.status}: ${responseText || 'No response body.'}`,
        ) as Error & { retryable: boolean; status?: number; retryAfterMs?: number };
        error.retryable = shouldRetryStatus(response.status);
        error.status = response.status;

        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          if (retryAfterMs !== null) {
            error.retryAfterMs = retryAfterMs;
          }
        }

        // Quota and auth errors should never be retried.
        if (response.status === 403 || response.status === 456 || response.status === 400) {
          error.retryable = false;
        }
        throw error;
      }

      let parsed: DeepLTranslationResponse;

      try {
        parsed = JSON.parse(responseText) as DeepLTranslationResponse;
      } catch (error) {
        throw new Error('Failed to parse DeepL response as JSON.');
      }

      if (!Array.isArray(parsed.translations)) {
        throw new Error('DeepL response did not contain expected translations array.');
      }

      const translations = parsed.translations.map((item) => item.text);

      if (translations.length !== texts.length) {
        throw new Error('DeepL response size mismatch compared to request.');
      }

      return translations;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        const abortError = new Error('DeepL request timed out.') as Error & { retryable: boolean };
        abortError.retryable = true;
        throw abortError;
      }

      if (error instanceof Error && typeof (error as any).retryable === 'undefined') {
        (error as any).retryable = true;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  return retryWithBackoff(executeRequest, {
    retries: maxRetries,
    minMs: Math.min(500, timeoutMs),
    maxMs: timeoutMs,
    onRetry: (error, attempt, delay) => {
      warn('[DeepL] Retrying request', {
        attempt,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
};

/**
 * Translate an array of texts using DeepL with batching support.
 *
 * @param texts - Text strings to translate.
 * @param targetLang - Target language code (e.g. `EN`, `DE`, `ES`).
 *
 * @returns Promise resolving to translated strings in the same order.
 */
export const translateBatch = async (
  texts: string[],
  targetLang: string,
): Promise<string[]> => {
  if (texts.length === 0) {
    return [];
  }

  const target = normalizeTargetLang(targetLang);
  const config = getConfig();
  const chunkSize = config.isMock ? texts.length : MAX_TEXTS_PER_REQUEST;
  const results: string[] = [];

  for (let index = 0; index < texts.length; index += chunkSize) {
    const chunk = texts.slice(index, index + chunkSize);
    const translations = await requestDeepLChunk(chunk, target, config);
    results.push(...translations);
  }

  return results;
};

/**
 * Translate a single text using DeepL.
 *
 * @param text - The text to translate.
 * @param targetLang - Target language code (e.g. `EN`, `DE`, `ES`).
 *
 * @returns Promise resolving to the translated text.
 */
export const translateText = async (text: string, targetLang: string): Promise<string> => {
  const [translation] = await translateBatch([text], targetLang);
  return translation;
};
