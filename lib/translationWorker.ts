'use server';

import { translateBatch } from './deeplClient';
import { info, warn } from './log';
import { retryWithBackoff } from './retry';
import {
  createSupabaseServiceClient,
  type AnySupabaseClient,
  type TranslationMemoryEntry,
  upsertTranslationMemory,
} from './supabaseServer';

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
  segment_hash: string;
  source_text: string;
  translated_text: string | null;
}

const groupSegmentsByTarget = (
  segments: TranslationSegmentRow[],
): Map<string, TranslationSegmentRow[]> => {
  const groups = new Map<string, TranslationSegmentRow[]>();

  for (const segment of segments) {
    const list = groups.get(segment.target_lang) ?? [];
    list.push(segment);
    groups.set(segment.target_lang, list);
  }

  return groups;
};

const markJobCompleted = async (client: AnySupabaseClient, jobId: string): Promise<void> => {
  const completedAt = new Date().toISOString();

  await client
    .from('translation_jobs')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', jobId);

  await client.from('job_queue').update({ processed: true }).eq('job_id', jobId);
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
    await markJobCompleted(supabase, jobId);
    return;
  }

  const pendingSegments = segmentRows.filter((segment) => !segment.translated_text);

  if (pendingSegments.length === 0) {
    await markJobCompleted(supabase, jobId);
    return;
  }

  const groupedSegments = groupSegmentsByTarget(pendingSegments);
  const updates: Array<{ id: string; job_id: string; translated_text: string }> = [];
  const memoryEntries: TranslationMemoryEntry[] = [];

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

    translations.forEach((translatedText, index) => {
      const segment = group[index];
      updates.push({
        id: segment.id,
        job_id: segment.job_id,
        translated_text: translatedText,
      });

      memoryEntries.push({
        siteId: job.site_id,
        sourceLang: segment.source_lang ?? 'auto',
        targetLang,
        segmentHash: segment.segment_hash,
        translatedText,
      });
    });
  }

  if (updates.length > 0) {
    const { error: updateError } = await supabase
      .from('translation_segments')
      .upsert(updates, { onConflict: 'id', returning: 'minimal' });

    if (updateError) {
      throw new Error(`Failed to update translation segments: ${updateError.message}`);
    }
  }

  if (memoryEntries.length > 0) {
    await upsertTranslationMemory(memoryEntries, supabase);
  }

  await markJobCompleted(supabase, jobId);
  info('Worker completed translation job', { jobId });
};
