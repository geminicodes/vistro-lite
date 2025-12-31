'use server';

import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sha256Hex } from '../../../lib/hash';
import { info, warn } from '../../../lib/log';
import { HttpError, getClientIpHint, getRequestId, requireBearerApiKey } from '../../../lib/security';
import { splitHtmlToSegments } from '../../../lib/segmenter';
import { createSupabaseServiceClient } from '../../../lib/supabaseServer';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const DEFAULT_MAX_PAGES_PER_MINUTE = 10;
const DEFAULT_MAX_SEGMENTS = 2_000;
const DEFAULT_MAX_SEGMENT_TARGET_PAIRS = 10_000;
const SOURCE_LANG_DEFAULT = 'auto';

const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z]{2,3}([_-][A-Za-z]{2,4})?$/, 'Invalid locale code.');

const requestSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url().max(2_048).optional(),
  html: z.string().optional(),
  targetLocales: z.array(localeSchema).nonempty(),
});

class PayloadTooLargeError extends HttpError {
  constructor(message: string) {
    super(413, 'payload_too_large', message);
  }
}

class FetchTimeoutError extends HttpError {
  constructor(message: string) {
    super(504, 'fetch_timeout', message);
  }
}

class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, 'bad_request', message);
  }
}

const normalizeLocale = (value: string): string => value.trim().replace(/_/g, '-').toLowerCase();

const parseEnvInteger = (value: string | undefined, fallback: number, { min = 0 } = {}): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const isBlockedIp = (address: string): boolean => {
  // Best-effort SSRF protection: block private, loopback, link-local, and reserved ranges.
  const ipVersion = isIP(address);

  if (ipVersion === 4) {
    const [a, b] = address.split('.').map((n) => Number.parseInt(n, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
    if (normalized.startsWith('::ffff:')) return isBlockedIp(normalized.replace('::ffff:', ''));
    return false;
  }

  return true;
};

const resolveHostAddresses = async (hostname: string): Promise<string[]> => {
  if (isIP(hostname)) {
    return [hostname];
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

const validateOutboundUrl = async (rawUrl: string): Promise<URL> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError('Only http(s) URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestError('URLs containing credentials are not allowed.');
  }

  if (!parsed.hostname) {
    throw new BadRequestError('Invalid URL hostname.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new BadRequestError('Localhost URLs are not allowed.');
  }

  const addresses = await resolveHostAddresses(hostname);
  if (addresses.length === 0) {
    throw new BadRequestError('Unable to resolve URL hostname.');
  }

  if (addresses.some((address) => isBlockedIp(address))) {
    throw new BadRequestError('URL resolves to a blocked address.');
  }

  return parsed;
};

const readResponseWithLimit = async (response: Response): Promise<string> => {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new PayloadTooLargeError('Fetched HTML exceeds size limit.');
    }
    return new TextDecoder().decode(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      throw new PayloadTooLargeError('Fetched HTML exceeds size limit.');
    }
    chunks.push(value);
  }

  const concatenated = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
  return new TextDecoder().decode(concatenated);
};

const fetchHtmlWithLimit = async (url: string): Promise<string> => {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const validated = await validateOutboundUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(validated.toString(), {
        method: 'GET',
        headers: { Accept: 'text/html, application/xhtml+xml' },
        signal: controller.signal,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect (${response.status}) without location.`);
        }

        currentUrl = new URL(location, validated).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch HTML (${response.status}).`);
      }

      return await readResponseWithLimit(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new FetchTimeoutError('Timed out fetching HTML.');
      }

      if (error instanceof HttpError) {
        throw error;
      }

      throw new Error(error instanceof Error ? error.message : 'Failed to fetch HTML.');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new BadRequestError('Too many redirects.');
};

const buildCacheKey = (segmentHash: string, targetLang: string): string =>
  `${segmentHash}:${targetLang}`;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const ipHint = getClientIpHint(request);

  try {
    requireBearerApiKey(request, 'TRANSLATE_API_KEY');
  } catch (error) {
    if (error instanceof HttpError) {
      warn('Unauthorized translate request', { requestId, ip: ipHint, code: error.code });
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }

    return NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized.' } }, { status: 401 });
  }

  let parsedBody: z.infer<typeof requestSchema>;

  try {
    const json = await request.json();
    parsedBody = requestSchema.parse(json);
  } catch (error) {
    const message =
      error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(', ') : 'Invalid JSON payload.';
    return NextResponse.json({ error: { code: 'bad_request', message } }, { status: 400 });
  }

  const { siteId, url, html: providedHtml, targetLocales } = parsedBody;

  if ((url && providedHtml) || (!url && !providedHtml)) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Provide exactly one of "url" or "html".' } },
      { status: 400 },
    );
  }

  let client: ReturnType<typeof createSupabaseServiceClient>;
  try {
    client = createSupabaseServiceClient();
  } catch (error) {
    warn('Translate endpoint misconfigured', {
      requestId,
      ip: ipHint,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { code: 'misconfigured', message: 'Server is not configured.' } },
      { status: 500 },
    );
  }

  const limitPerMinute = parseEnvInteger(
    process.env.TRANSLATE_MAX_PAGES_PER_MINUTE,
    DEFAULT_MAX_PAGES_PER_MINUTE,
    { min: 0 },
  );

  if (limitPerMinute > 0) {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await client
      .from('translation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', oneMinuteAgo);

    if (countError) {
      return NextResponse.json(
        { error: { code: 'internal', message: `Failed to check rate limit: ${countError.message}` } },
        { status: 500 },
      );
    }

    if ((count ?? 0) >= limitPerMinute) {
      return NextResponse.json(
        { error: { code: 'rate_limited', message: 'Rate limit exceeded. Please retry shortly.' } },
        { status: 429 },
      );
    }
  }

  const normalizedTargetLocales = Array.from(new Set(targetLocales.map((locale) => normalizeLocale(locale))));

  let html = providedHtml ?? '';

  if (!html && url) {
    try {
      html = await fetchHtmlWithLimit(url);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 502;
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to fetch HTML.';
      const code = error instanceof HttpError ? error.code : 'fetch_failed';
      return NextResponse.json({ error: { code, message } }, { status });
    }
  }

  if (!html) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'No HTML content provided.' } },
      { status: 400 },
    );
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'HTML exceeds size limit.' } },
      { status: 413 },
    );
  }

  const segments = splitHtmlToSegments(html);
  if (segments.length === 0) {
    return NextResponse.json({ jobId: null, cachedCount: 0, toTranslateCount: 0 });
  }

  const maxSegments = parseEnvInteger(process.env.TRANSLATE_MAX_SEGMENTS, DEFAULT_MAX_SEGMENTS, { min: 1 });
  if (segments.length > maxSegments) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'Too many segments extracted from HTML.' } },
      { status: 413 },
    );
  }

  const hashedSegments = segments.map((segment) => ({
    ...segment,
    segmentHash: sha256Hex(segment.text),
  }));

  const uniqueSegmentHashes = Array.from(new Set(hashedSegments.map((segment) => segment.segmentHash)));

  const { data: cachedTranslations, error: cacheError } = await client
    .from('translation_memory')
    .select('segment_hash,target_lang,translated_text')
    .eq('site_id', siteId)
    .in('segment_hash', uniqueSegmentHashes)
    .in('target_lang', normalizedTargetLocales);

  if (cacheError) {
    return NextResponse.json(
      { error: { code: 'internal', message: `Failed to read translation cache: ${cacheError.message}` } },
      { status: 500 },
    );
  }

  const cachedMap = new Map<string, string>();
  for (const row of cachedTranslations ?? []) {
    const key = buildCacheKey(row.segment_hash, row.target_lang);
    cachedMap.set(key, row.translated_text ?? '');
  }

  const segmentsToTranslate: Array<{ segmentHash: string; targetLang: string; sourceText: string }> = [];
  let cachedCount = 0;

  for (const segment of hashedSegments) {
    for (const targetLang of normalizedTargetLocales) {
      const key = buildCacheKey(segment.segmentHash, targetLang);
      if (cachedMap.has(key)) {
        cachedCount += 1;
        continue;
      }

      segmentsToTranslate.push({
        segmentHash: segment.segmentHash,
        targetLang,
        sourceText: segment.text,
      });
    }
  }

  if (segmentsToTranslate.length === 0) {
    return NextResponse.json({ jobId: null, cachedCount, toTranslateCount: 0 });
  }

  const maxPairs = parseEnvInteger(
    process.env.TRANSLATE_MAX_SEGMENT_TARGET_PAIRS,
    DEFAULT_MAX_SEGMENT_TARGET_PAIRS,
    { min: 1 },
  );
  if (segmentsToTranslate.length > maxPairs) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'Too many segments to translate.' } },
      { status: 413 },
    );
  }

  const idempotencyKeyRaw = request.headers.get('idempotency-key')?.trim() ?? '';
  const idempotencyKey = idempotencyKeyRaw && idempotencyKeyRaw.length <= 128 ? idempotencyKeyRaw : null;

  const rpcSegments = segmentsToTranslate.map((entry) => ({
    source_lang: SOURCE_LANG_DEFAULT,
    target_lang: entry.targetLang,
    segment_hash: entry.segmentHash,
    source_text: entry.sourceText,
  }));

  const { data: jobId, error: rpcError } = await client.rpc('enqueue_translation_job', {
    p_site_id: siteId,
    p_source_url: url ?? null,
    p_idempotency_key: idempotencyKey,
    p_segments: rpcSegments,
  });

  if (rpcError || !jobId) {
    warn('Failed to enqueue translation job', {
      requestId,
      siteId,
      error: rpcError?.message ?? 'Missing jobId from RPC.',
    });
    return NextResponse.json(
      { error: { code: 'internal', message: `Failed to enqueue translation job: ${rpcError?.message ?? 'RPC failed.'}` } },
      { status: 500 },
    );
  }

  info('Enqueued translation job', {
    requestId,
    siteId,
    jobId,
    cachedCount,
    toTranslateCount: segmentsToTranslate.length,
  });

  return NextResponse.json({
    jobId,
    cachedCount,
    toTranslateCount: segmentsToTranslate.length,
  });
}
