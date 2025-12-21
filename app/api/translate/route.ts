'use server';

import { Buffer } from 'node:buffer';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sha256Hex } from '../../../lib/hash';
import { splitHtmlToSegments } from '../../../lib/segmenter';
import { createSupabaseServiceClient } from '../../../lib/supabaseServer';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_PAGES_PER_MINUTE = 10;
const SOURCE_LANG_DEFAULT = 'auto';

const requestSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url().optional(),
  html: z.string().optional(),
  targetLocales: z.array(z.string().min(2)).nonempty(),
});

class PayloadTooLargeError extends Error {
  status = 413;
}

class FetchTimeoutError extends Error {
  status = 504;
}

const parseEnvInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const fetchHtmlWithLimit = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/html, application/xhtml+xml' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML (${response.status}).`);
    }

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

      if (done) {
        break;
      }

      if (value) {
        received += value.byteLength;

        if (received > MAX_HTML_BYTES) {
          throw new PayloadTooLargeError('Fetched HTML exceeds size limit.');
        }

        chunks.push(value);
      }
    }

    const concatenated = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    return new TextDecoder().decode(concatenated);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new FetchTimeoutError('Timed out fetching HTML.');
    }

    if (error instanceof PayloadTooLargeError || error instanceof FetchTimeoutError) {
      throw error;
    }

    throw new Error(error instanceof Error ? error.message : 'Failed to fetch HTML.');
  } finally {
    clearTimeout(timeout);
  }
};

const buildCacheKey = (segmentHash: string, targetLang: string): string =>
  `${segmentHash}:${targetLang}`;

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let parsedBody: z.infer<typeof requestSchema>;

  try {
    const json = await request.json();
    parsedBody = requestSchema.parse(json);
  } catch (error) {
    const message =
      error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(', ') : 'Invalid JSON payload.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { siteId, url, html: providedHtml, targetLocales } = parsedBody;

  if (!url && !providedHtml) {
    return NextResponse.json(
      { error: 'Either "url" or "html" must be provided.' },
      { status: 400 },
    );
  }

  const client = createSupabaseServiceClient();

  const limitPerMinute = parseEnvInteger(
    process.env.TRANSLATE_MAX_PAGES_PER_MINUTE,
    DEFAULT_MAX_PAGES_PER_MINUTE,
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
        { error: `Failed to check rate limit: ${countError.message}` },
        { status: 500 },
      );
    }

    if ((count ?? 0) >= limitPerMinute) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please retry shortly.' },
        { status: 429 },
      );
    }
  }

  let html = providedHtml ?? '';

  if (!html && url) {
    try {
      html = await fetchHtmlWithLimit(url);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      if (error instanceof FetchTimeoutError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unable to fetch HTML.' },
        { status: 502 },
      );
    }
  }

  if (!html) {
    return NextResponse.json({ error: 'No HTML content provided.' }, { status: 400 });
  }

  const segments = splitHtmlToSegments(html);

  if (segments.length === 0) {
    return NextResponse.json({ jobId: null, cachedCount: 0, toTranslateCount: 0 });
  }

  const hashedSegments = segments.map((segment) => ({
    ...segment,
    segmentHash: sha256Hex(segment.text),
  }));

  const uniqueSegmentHashes = Array.from(
    new Set(hashedSegments.map((segment) => segment.segmentHash)),
  );

  const { data: cachedTranslations, error: cacheError } = await client
    .from('translation_memory')
    .select('segment_hash,target_lang,translated_text')
    .eq('site_id', siteId)
    .in('segment_hash', uniqueSegmentHashes)
    .in('target_lang', targetLocales);

  if (cacheError) {
    return NextResponse.json(
      { error: `Failed to read translation cache: ${cacheError.message}` },
      { status: 500 },
    );
  }

  const cachedMap = new Map<string, string>();

  for (const row of cachedTranslations ?? []) {
    const key = buildCacheKey(row.segment_hash, row.target_lang);
    cachedMap.set(key, row.translated_text ?? '');
  }

  const segmentsToTranslate: Array<{
    segmentHash: string;
    targetLang: string;
    sourceText: string;
  }> = [];
  let cachedCount = 0;

  for (const segment of hashedSegments) {
    for (const targetLang of targetLocales) {
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
    return NextResponse.json({
      jobId: null,
      cachedCount,
      toTranslateCount: 0,
    });
  }

  const jobId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { error: jobError } = await client.from('translation_jobs').insert({
    id: jobId,
    site_id: siteId,
    source_url: url ?? null,
    status: 'pending',
    created_at: nowIso,
  });

  if (jobError) {
    return NextResponse.json(
      { error: `Failed to create translation job: ${jobError.message}` },
      { status: 500 },
    );
  }

  const segmentPayload = segmentsToTranslate.map((entry) => ({
    id: crypto.randomUUID(),
    job_id: jobId,
    source_lang: SOURCE_LANG_DEFAULT,
    target_lang: entry.targetLang,
    segment_hash: entry.segmentHash,
    source_text: entry.sourceText,
    translated_text: null,
    created_at: nowIso,
  }));

  const { error: segmentError } = await client.from('translation_segments').insert(segmentPayload);

  if (segmentError) {
    return NextResponse.json(
      {
        error: `Failed to enqueue translation segments: ${segmentError.message}`,
      },
      { status: 500 },
    );
  }

  const { error: queueError } = await client.from('job_queue').insert({
    job_id: jobId,
    enqueued_at: nowIso,
    processed: false,
  });

  if (queueError) {
    return NextResponse.json(
      { error: `Failed to enqueue job: ${queueError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    jobId,
    cachedCount,
    toTranslateCount: segmentsToTranslate.length,
  });
}
