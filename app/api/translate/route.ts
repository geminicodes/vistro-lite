'use server';

import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sha256Hex } from '../../../lib/hash';
import { info, warn } from '../../../lib/log';
import { splitHtmlToSegments } from '../../../lib/segmenter';
import { createSupabaseServiceClient } from '../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB
const FETCH_TIMEOUT_MS = 5_000;
const SOURCE_LANG_DEFAULT = 'auto';

const requestSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url().max(2_048).optional(),
  html: z.string().optional(),
  targetLocales: z.array(z.string().trim().min(2).max(20)).nonempty(),
});

const getBearerToken = (request: Request): string | null => {
  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() || null;
};

const isBlockedIp = (address: string): boolean => {
  const ipVersion = isIP(address);

  if (ipVersion === 4) {
    const [a, b] = address.split('.').map((n) => Number.parseInt(n, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;

    // Block: localhost, 127.0.0.0/8
    if (a === 127) return true;
    // Block: 10.0.0.0/8
    if (a === 10) return true;
    // Block: 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // Block: 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    return false;
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return true; // localhost
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

const validateOutboundUrl = async (rawUrl: string): Promise<string> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not allowed.');
  }

  const hostname = parsed.hostname?.toLowerCase() ?? '';
  if (!hostname) {
    throw new Error('Invalid URL hostname.');
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Localhost URLs are not allowed.');
  }

  const addresses = await resolveHostAddresses(hostname);
  if (addresses.length === 0) {
    throw new Error('Unable to resolve URL hostname.');
  }

  if (addresses.some((address) => isBlockedIp(address))) {
    throw new Error('URL resolves to a private or localhost address.');
  }

  return parsed.toString();
};

const fetchHtmlWithLimit = async (url: string): Promise<string> => {
  const validatedUrl = await validateOutboundUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validatedUrl, {
      method: 'GET',
      headers: { Accept: 'text/html, application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error('Redirects are not allowed when fetching HTML.');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML (${response.status}).`);
    }

    if (!response.body) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_HTML_BYTES) {
        throw new Error('Fetched HTML exceeds size limit.');
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
        throw new Error('Fetched HTML exceeds size limit.');
      }
      chunks.push(value);
    }

    const concatenated = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    return new TextDecoder().decode(concatenated);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Timed out fetching HTML.');
    }
    throw error instanceof Error ? error : new Error('Failed to fetch HTML.');
  } finally {
    clearTimeout(timeout);
  }
};

export async function POST(request: Request): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Missing bearer token.' } }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(', ') : 'Invalid JSON payload.';
    return NextResponse.json({ error: { code: 'bad_request', message } }, { status: 400 });
  }

  const { siteId, url, html: providedHtml, targetLocales } = body;

  if (!url && !providedHtml) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Either "url" or "html" must be provided.' } },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: { code: 'misconfigured', message: 'SUPABASE_URL / SUPABASE_ANON_KEY not configured.' } },
      { status: 500 },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Invalid bearer token.' } }, { status: 401 });
  }

  // Authorization: ensure the authed user owns the site.
  const { data: siteRows, error: siteError } = await userClient
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .limit(1);

  if (siteError) {
    return NextResponse.json(
      { error: { code: 'internal', message: `Failed to authorize site: ${siteError.message}` } },
      { status: 500 },
    );
  }

  if (!siteRows || siteRows.length === 0) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Not authorized for site.' } }, { status: 403 });
  }

  let html = providedHtml ?? '';
  if (!html && url) {
    try {
      html = await fetchHtmlWithLimit(url);
    } catch (error) {
      return NextResponse.json(
        { error: { code: 'fetch_failed', message: error instanceof Error ? error.message : 'Failed to fetch HTML.' } },
        { status: 502 },
      );
    }
  }

  if (!html) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'No HTML content provided.' } }, { status: 400 });
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'HTML exceeds size limit.' } },
      { status: 413 },
    );
  }

  const segments = splitHtmlToSegments(html);
  if (segments.length === 0) {
    return NextResponse.json({ jobId: null, segments: 0 }, { status: 200 });
  }

  const service = createSupabaseServiceClient();

  // Transactional enqueue: job + segments + queue via Postgres function.
  const idempotencyKeyRaw = request.headers.get('idempotency-key')?.trim() ?? '';
  const idempotencyKey = idempotencyKeyRaw && idempotencyKeyRaw.length <= 128 ? idempotencyKeyRaw : null;

  const rpcSegments = segments.flatMap((segment) => {
    const segmentHash = sha256Hex(segment.text);
    return targetLocales.map((targetLang) => ({
      source_lang: SOURCE_LANG_DEFAULT,
      target_lang: targetLang,
      segment_hash: segmentHash,
      source_text: segment.text,
    }));
  });

  const { data: jobId, error: rpcError } = await service.rpc('enqueue_translation_job', {
    p_site_id: siteId,
    p_source_url: url ?? null,
    p_idempotency_key: idempotencyKey,
    p_segments: rpcSegments,
  });

  if (rpcError || !jobId) {
    return NextResponse.json(
      { error: { code: 'internal', message: `Failed to enqueue translation job: ${rpcError?.message ?? 'RPC failed.'}` } },
      { status: 500 },
    );
  }

  // Log minimal metadata only (no HTML, no segment text).
  info('Created translation job', {
    siteId,
    jobId,
    segments: segments.length,
    targets: targetLocales.length,
  });

  return NextResponse.json({ jobId, segments: segments.length }, { status: 200 });
}
