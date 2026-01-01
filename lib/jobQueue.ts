'use server';

import os from 'node:os';

import { info, warn } from './log';
import { createSupabaseServiceClient } from './supabaseServer';

export interface QueuedJob {
  queueId: number;
  jobId: string;
  enqueuedAt: string;
}

const WORKER_NAME = os.hostname();

const isMissingRpc = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as any).code as string | undefined;
  const message = ((error as any).message as string | undefined) ?? '';

  // Common PostgREST codes/messages when RPC is missing from schema cache.
  if (code === 'PGRST202' || code === '42883') {
    return true;
  }

  return /could not find the function/i.test(message) || /does not exist/i.test(message);
};

/**
 * Enqueue a translation job for worker processing.
 *
 * Behavior:
 * - Prefers Postgres RPC: `enqueue_job(p_job_id uuid)`
 * - Fallback: idempotent upsert into `job_queue` (unique on `job_id`)
 *
 * Idempotency:
 * - Calling this repeatedly for the same `jobId` results in at most one queue row.
 *
 * Recommended SQL (RPC) definitions:
 *
 * ```sql
 * -- Idempotent enqueue (service role only)
 * create or replace function public.enqueue_job(p_job_id uuid)
 * returns void
 * language plpgsql
 * security definer
 * set search_path = public
 * as $$
 * begin
 *   insert into public.job_queue (job_id, processed, enqueued_at)
 *   values (p_job_id, false, now())
 *   on conflict (job_id) do update set
 *     processed = false,
 *     processed_at = null,
 *     enqueued_at = excluded.enqueued_at;
 * end;
 * $$;
 *
 * grant execute on function public.enqueue_job(uuid) to service_role;
 * ```
 */
export async function enqueueJob(jobId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // Prefer RPC.
  const { error: rpcError } = await supabase.rpc('enqueue_job', {
    p_job_id: jobId,
  });

  if (!rpcError) {
    info('Enqueued job', { jobId });
    return;
  }

  if (!isMissingRpc(rpcError)) {
    throw new Error(`Failed to enqueue job via RPC: ${rpcError.message}`);
  }

  warn('enqueue_job RPC missing; falling back to table upsert', { jobId });

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from('job_queue')
    .upsert(
      {
        job_id: jobId,
        processed: false,
        processed_at: null,
        enqueued_at: nowIso,
      },
      { onConflict: 'job_id' },
    );

  if (upsertError) {
    throw new Error(`Failed to enqueue job via fallback: ${upsertError.message}`);
  }

  info('Enqueued job (fallback)', { jobId });
}

/**
 * Fetch queued jobs for processing.
 *
 * Behavior:
 * - Prefers Postgres RPC: `fetch_queued_jobs(p_limit int, p_worker text)`
 * - Fallback: selects oldest `processed=false` rows and best-effort updates them to `processed=true`
 *
 * Side effects:
 * - In fallback mode, rows returned are marked `processed=true` (best-effort).
 *
 * Recommended SQL (RPC) definitions:
 *
 * ```sql
 * create or replace function public.fetch_queued_jobs(p_limit int, p_worker text)
 * returns table(queue_id int, job_id uuid, enqueued_at timestamptz)
 * language plpgsql
 * security definer
 * set search_path = public
 * as $$
 * begin
 *   return query
 *   with picked as (
 *     select id, job_id, enqueued_at
 *     from public.job_queue
 *     where processed = false
 *     order by enqueued_at asc
 *     limit greatest(0, p_limit)
 *   ), marked as (
 *     update public.job_queue jq
 *     set processed = true, processed_at = now()
 *     where jq.id in (select id from picked)
 *     returning jq.id
 *   )
 *   select p.id as queue_id, p.job_id, p.enqueued_at from picked p;
 * end;
 * $$;
 *
 * grant execute on function public.fetch_queued_jobs(int, text) to service_role;
 * ```
 */
export async function fetchQueuedJobs(limit = 10): Promise<QueuedJob[]> {
  const supabase = createSupabaseServiceClient();
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

  // Prefer RPC.
  const { data, error: rpcError } = await supabase.rpc('fetch_queued_jobs', {
    p_limit: safeLimit,
    p_worker: WORKER_NAME,
  });

  if (!rpcError) {
    const rows = Array.isArray(data) ? (data as any[]) : [];
    const result: QueuedJob[] = rows
      .map((row) => ({
        queueId: Number(row.queue_id),
        jobId: String(row.job_id),
        enqueuedAt: String(row.enqueued_at),
      }))
      .filter((row) => Number.isFinite(row.queueId) && Boolean(row.jobId) && Boolean(row.enqueuedAt));

    info('Fetched queued jobs', { count: result.length, limit: safeLimit, worker: WORKER_NAME });
    return result;
  }

  if (!isMissingRpc(rpcError)) {
    throw new Error(`Failed to fetch queued jobs via RPC: ${rpcError.message}`);
  }

  warn('fetch_queued_jobs RPC missing; falling back to table operations', {
    limit: safeLimit,
    worker: WORKER_NAME,
  });

  const { data: rows, error: selectError } = await supabase
    .from('job_queue')
    .select('id,job_id,enqueued_at')
    .eq('processed', false)
    .order('enqueued_at', { ascending: true })
    .limit(safeLimit);

  if (selectError) {
    throw new Error(`Failed to fetch queued jobs via fallback: ${selectError.message}`);
  }

  const selected = (rows as any[] | null) ?? [];
  const result: QueuedJob[] = selected.map((row) => ({
    queueId: Number(row.id),
    jobId: String(row.job_id),
    enqueuedAt: String(row.enqueued_at),
  }));

  const ids = result.map((row) => row.queueId).filter((id) => Number.isFinite(id));
  if (ids.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('job_queue')
      .update({ processed: true, processed_at: nowIso })
      .in('id', ids)
      .eq('processed', false);

    if (updateError) {
      // Best-effort only: do not fail the fetch if marking processed fails.
      warn('Failed to mark fetched jobs processed (best-effort)', {
        count: ids.length,
        error: updateError.message,
      });
    }
  }

  info('Fetched queued jobs (fallback)', { count: result.length, limit: safeLimit, worker: WORKER_NAME });
  return result;
}

