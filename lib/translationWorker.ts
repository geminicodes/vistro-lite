'use server';

import { translateBatch } from './deeplClient';
import { info, warn } from './log';
import { retryWithBackoff } from './retry';
import {
  createSupabaseServiceClient,
  type TranslationMemoryEntry,
  upsertTranslationMemory,
} from './supabaseServer';

const SOURCE_LANG_DEFAULT = 'auto';

interface TranslationJobRow {
  id: string;
  site_id: string;
  status: string;
}

interface TranslationSegmentRow {
  id: string;
  job_id: string;
  source_lang: string | null;
  target_lang: string;
  segment_hash: string;
  source_text: string;
  translated_text: string | null;
}
 
const parseIntegerEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
 
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
 
const WORKER_RETRIES = parseIntegerEnv(process.env.WORKER_TRANSLATE_RETRIES, 3);
const WORKER_MIN_DELAY_MS = parseIntegerEnv(process.env.WORKER_TRANSLATE_MIN_MS, 500);
const WORKER_MAX_DELAY_MS = parseIntegerEnv(process.env.WORKER_TRANSLATE_MAX_MS, 5_000);
 
const groupSegmentsByTarget = (
  segments: TranslationSegmentRow[],
): Map<string, TranslationSegmentRow[]> => {
  const groups = new Map<string, TranslationSegmentRow[]>();

  for (const segment of segments) {
    const key = segment.target_lang;
    const existing = groups.get(key);
    if (existing) {
      existing.push(segment);
    } else {
      groups.set(key, [segment]);
    }
  }

  return groups;
};

const buildCacheKey = (segmentHash: string, targetLang: string): string => `${segmentHash}:${targetLang}`;

const applyCacheToPendingSegments = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  siteId: string,
  pendingSegments: TranslationSegmentRow[],
): Promise<{ cachedUpdates: Array<{ id: string; job_id: string; translated_text: string }>; remaining: TranslationSegmentRow[] }> => {
  if (pendingSegments.length === 0) {
    return { cachedUpdates: [], remaining: [] };
  }

  const uniqueHashes = Array.from(new Set(pendingSegments.map((seg) => seg.segment_hash)));
  const uniqueTargets = Array.from(new Set(pendingSegments.map((seg) => seg.target_lang)));

  const { data, error } = await supabase
    .from('translation_memory')
    .select('segment_hash,target_lang,translated_text')
    .eq('site_id', siteId)
    .in('segment_hash', uniqueHashes)
    .in('target_lang', uniqueTargets);

  if (error) {
    // Cache is an optimization: do not fail the job for cache read errors.
    warn('Worker failed to read translation memory (continuing)', {
      siteId,
      error: error.message,
    });
    return { cachedUpdates: [], remaining: pendingSegments };
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = buildCacheKey(row.segment_hash, row.target_lang);
    map.set(key, row.translated_text ?? '');
  }

  const cachedUpdates: Array<{ id: string; job_id: string; translated_text: string }> = [];
  const remaining: TranslationSegmentRow[] = [];

  for (const seg of pendingSegments) {
    const cached = map.get(buildCacheKey(seg.segment_hash, seg.target_lang));
    if (cached !== undefined && cached !== null && cached !== '') {
      cachedUpdates.push({ id: seg.id, job_id: seg.job_id, translated_text: cached });
    } else {
      remaining.push(seg);
    }
  }

  return { cachedUpdates, remaining };
};

const updateJobProgress = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  jobId: string,
): Promise<void> => {
  const { count, error } = await supabase
    .from('translation_segments')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .not('translated_text', 'is', null);

  if (!error) {
    await supabase.from('translation_jobs').update({ translated_segments: count ?? 0 }).eq('id', jobId);
  }
};

export const processTranslationJob = async (jobId: string): Promise<void> => {
  const supabase = createSupabaseServiceClient();

  const { data: jobs, error: jobError } = await supabase
    .from('translation_jobs')
    .select('id,site_id,status')
    .eq('id', jobId);

  if (jobError) {
    throw new Error(`Failed to load translation job: ${jobError.message}`);
  }

  const job = (jobs as TranslationJobRow[] | null)?.[0];

  if (!job) {
    throw new Error(`Translation job ${jobId} not found.`);
  }

  if (job.status === 'completed') {
    return;
  }

  const { data: segments, error: segmentError } = await supabase
    .from('translation_segments')
    .select('id,job_id,source_lang,target_lang,segment_hash,source_text,translated_text')
    .eq('job_id', jobId);

  if (segmentError) {
    throw new Error(`Failed to load translation segments: ${segmentError.message}`);
  }

  const segmentRows = (segments as TranslationSegmentRow[] | null) ?? [];

  if (segmentRows.length === 0) {
    return;
  }

  const pendingSegments = segmentRows.filter((segment) => !segment.translated_text);

  if (pendingSegments.length === 0) {
    return;
  }

  // Re-check cache at processing time to avoid duplicate DeepL calls under concurrency.
  const { cachedUpdates, remaining } = await applyCacheToPendingSegments(supabase, job.site_id, pendingSegments);

  if (cachedUpdates.length > 0) {
    const { error: cachedUpdateError } = await supabase
      .from('translation_segments')
      .upsert(cachedUpdates, { onConflict: 'id' });

    if (cachedUpdateError) {
      throw new Error(`Failed to apply cached translations: ${cachedUpdateError.message}`);
    }
  }

  await updateJobProgress(supabase, jobId);

  if (remaining.length === 0) {
    info('Worker completed job using cache only', { jobId });
    return;
  }

  const groupedSegments = groupSegmentsByTarget(remaining);

  info('Worker processing translation job', { jobId, groups: groupedSegments.size });

  for (const [targetLang, group] of groupedSegments.entries()) {
    const translations = await retryWithBackoff(
      () => translateBatch(group.map((segment) => segment.source_text), targetLang),
      {
        retries: WORKER_RETRIES,
        minMs: WORKER_MIN_DELAY_MS,
        maxMs: WORKER_MAX_DELAY_MS,
        onRetry: (error, attempt, delay) => {
          warn('Retrying translation batch', {
            jobId,
            targetLang,
            attempt,
            delayMs: delay,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );

    if (translations.length !== group.length) {
      throw new Error('DeepL translation response length mismatch.');
    }

    const updates: Array<{ id: string; job_id: string; translated_text: string }> = [];
    const memoryEntries: TranslationMemoryEntry[] = [];

    translations.forEach((translatedText, index) => {
      const segment = group[index];
      updates.push({ id: segment.id, job_id: segment.job_id, translated_text: translatedText });
      memoryEntries.push({
        siteId: job.site_id,
        sourceLang: segment.source_lang ?? SOURCE_LANG_DEFAULT,
        targetLang,
        segmentHash: segment.segment_hash,
        translatedText,
      });
    });

    const { error: updateError } = await supabase
      .from('translation_segments')
      .upsert(updates, { onConflict: 'id' });

    if (updateError) {
      throw new Error(`Failed to update translation segments: ${updateError.message}`);
    }

    await upsertTranslationMemory(memoryEntries, supabase);
    await updateJobProgress(supabase, jobId);
  }

  info('Worker finished translating job segments', { jobId });
};
