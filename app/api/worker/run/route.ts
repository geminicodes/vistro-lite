'use server';

import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { info, warn } from '../../../../lib/log';
import { fetchQueuedJobs } from '../../../../lib/jobQueue';
import { processTranslationJob } from '../../../../lib/translationWorker';
import { createSupabaseServiceClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const safeCompare = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
};

const requireWorkerSecret = (request: Request): { ok: true } | { ok: false; response: Response } => {
  const expected = process.env.WORKER_RUN_SECRET?.trim() ?? '';
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'misconfigured', message: 'WORKER_RUN_SECRET is not configured.' } },
        { status: 500 },
      ),
    };
  }

  const received = request.headers.get('x-worker-secret') ?? '';
  if (!received || !safeCompare(received, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized.' } }, { status: 401 }),
    };
  }

  return { ok: true };
};

export async function POST(request: Request): Promise<Response> {
  const auth = requireWorkerSecret(request);
  if (!auth.ok) {
    return auth.response;
  }

  const batchLimit = parsePositiveInt(process.env.WORKER_BATCH, 10);
  const supabase = createSupabaseServiceClient();

  info('Worker run triggered', { batchLimit });

  const queued = await fetchQueuedJobs(batchLimit);
  const results: Array<{
    jobId: string;
    status: 'ok' | 'error';
    segmentsProcessed: number;
    cacheHits: number;
    cacheMisses: number;
  }> = [];

  for (const item of queued) {
    const jobId = item.jobId;
    let cacheHits = 0;
    let cacheMisses = 0;
    let segmentsProcessed = 0;

    try {
      // Pre-compute cache hit/miss estimate for currently pending segments.
      const { data: jobRows, error: jobError } = await supabase
        .from('translation_jobs')
        .select('id,site_id')
        .eq('id', jobId)
        .limit(1);

      if (jobError) {
        throw new Error(`Failed to load job metadata: ${jobError.message}`);
      }

      const siteId = (jobRows as any[] | null)?.[0]?.site_id as string | undefined;
      if (!siteId) {
        throw new Error('Job site_id not found.');
      }

      const { data: segmentRows, error: segmentError } = await supabase
        .from('translation_segments')
        .select('id,segment_hash,target_lang,translated_text')
        .eq('job_id', jobId);

      if (segmentError) {
        throw new Error(`Failed to load segments: ${segmentError.message}`);
      }

      const segments = (segmentRows as any[] | null) ?? [];
      const translatedBefore = segments.filter((s) => s.translated_text).length;
      const pending = segments.filter((s) => !s.translated_text);

      if (pending.length > 0) {
        const uniqueHashes = Array.from(new Set(pending.map((s) => s.segment_hash)));
        const uniqueTargets = Array.from(new Set(pending.map((s) => s.target_lang)));

        const { data: memoryRows, error: memoryError } = await supabase
          .from('translation_memory')
          .select('segment_hash,target_lang,translated_text')
          .eq('site_id', siteId)
          .in('segment_hash', uniqueHashes)
          .in('target_lang', uniqueTargets);

        if (!memoryError) {
          const memMap = new Map<string, string>();
          for (const row of (memoryRows as any[] | null) ?? []) {
            memMap.set(`${row.segment_hash}:${row.target_lang}`, row.translated_text ?? '');
          }

          for (const seg of pending) {
            const cached = memMap.get(`${seg.segment_hash}:${seg.target_lang}`);
            if (cached) cacheHits += 1;
            else cacheMisses += 1;
          }
        } else {
          // If memory lookup fails, report unknown as misses (conservative).
          cacheMisses = pending.length;
          warn('Failed to read translation_memory for cache stats', { jobId, error: memoryError.message });
        }
      }

      await processTranslationJob(jobId);

      const { count: translatedAfter, error: countError } = await supabase
        .from('translation_segments')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .not('translated_text', 'is', null);

      if (countError) {
        warn('Failed to count translated segments after job', { jobId, error: countError.message });
      } else {
        segmentsProcessed = Math.max(0, (translatedAfter ?? 0) - translatedBefore);
      }

      results.push({ jobId, status: 'ok', segmentsProcessed, cacheHits, cacheMisses });
      info('Worker processed job', { jobId, segmentsProcessed, cacheHits, cacheMisses });
    } catch (error) {
      results.push({ jobId, status: 'error', segmentsProcessed, cacheHits, cacheMisses });
      warn('Worker job failed', { jobId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json(
    {
      processedCount: results.length,
      jobs: results,
    },
    { status: 200 },
  );
}

