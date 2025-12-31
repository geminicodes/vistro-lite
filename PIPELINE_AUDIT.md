# Vistro Lite — Translation Pipeline Audit (Enqueue → Process → Cache → Retry)

This document audits and hardens the end-to-end translation pipeline:

1. API receives URL/HTML → 2. Segment into translatable text → 3. Cache lookup → 4. Enqueue misses  
5. Worker claims job → 6. Batch DeepL calls → 7. Retry failures → 8. Write translations → 9. Upsert memory → 10. Mark job complete

Verification status:

- ✅ `npm run lint` (TypeScript strict)
- ✅ `npm test` (Vitest)

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Worker coordination / queue claiming
File: `workers/translationWorker.js:41`
Problem: Non-atomic dequeue would allow multiple workers to process the same job concurrently.
Risk: Duplicate DeepL charges, inconsistent writes, job flapping.
Fix: Implemented atomic, lease-based claiming via Supabase RPC + Postgres row locking (`FOR UPDATE SKIP LOCKED`), with lock tokens and lease expiry for crash recovery.
Code:

```js
const { data } = await client.rpc('claim_next_translation_job', {
  p_worker_id: WORKER_ID,
  p_lease_seconds: WORKER_LEASE_SECONDS,
});
```

Verified: ✅ Job claim is single-winner; lease expiry enables reclaim.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Enqueue atomicity
File: `supabase/schema.sql:... enqueue_translation_job`
Problem: Enqueue previously required 3 separate writes (job, segments, queue) without a transaction.
Risk: Partial writes → orphaned jobs, inconsistent queue state, data loss scenarios.
Fix: Added transactional RPC `enqueue_translation_job(...)` that inserts/updates job, inserts segments idempotently, and upserts queue row in one server-side function.
Code:

```sql
create or replace function public.enqueue_translation_job(...) returns uuid ...
```

Verified: ✅ API now calls `client.rpc('enqueue_translation_job', ...)`.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Cache correctness under concurrency
File: `lib/translationWorker.ts:... applyCacheToPendingSegments`
Problem: Cache was only checked at enqueue time. If two jobs enqueue the same miss concurrently, both workers would call DeepL even if the first worker has already written to `translation_memory`.
Risk: Duplicate DeepL spend and slower throughput under bursty traffic.
Fix: Worker re-checks `translation_memory` for all pending segments before calling DeepL, applies cached translations immediately, then translates only remaining misses.
Code:

```ts
const { cachedUpdates, remaining } = await applyCacheToPendingSegments(
  supabase,
  job.site_id,
  pendingSegments,
);
```

Verified: ✅ `tests/worker.test.ts` includes a case where one segment is served from cache and DeepL is called only once.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Partial progress durability
File: `lib/translationWorker.ts:... loop over groupedSegments`
Problem: Previously, translations were accumulated and written at the end of the job, so a crash mid-job could lose all progress.
Risk: Data loss (progress) and repeated DeepL calls after retries/restarts.
Fix: Persist translations and memory per target-language group and update job progress after each group.
Code:

```ts
await supabase.from('translation_segments').upsert(updates, { onConflict: 'id' });
await upsertTranslationMemory(memoryEntries, supabase);
await updateJobProgress(supabase, jobId);
```

Verified: ✅ Writes happen before job completion; progress is monotonic.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Job lifecycle state machine
File: `supabase/schema.sql: claim_* and complete/release functions`
Problem: Job status transitions were not tightly coupled to claims/completion; `translation_jobs.status` could become inaccurate under crashes.
Risk: Operational confusion and monitoring blind spots.
Fix: Claim RPCs now set `translation_jobs.status='processing'` and `started_at`. Release sets status back to `pending`. Completion marks `completed`/`failed`.
Code:

```sql
update public.translation_jobs
set status = 'processing', started_at = coalesce(started_at, now())
where id in (select job_id from claimed);
```

Verified: ✅ Status transitions are driven by the same DB-side claim/complete semantics.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #6
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Queue poison-pill handling
File: `workers/translationWorker.js:... WORKER_MAX_JOB_ATTEMPTS`
Problem: Without an attempt cap, pathological jobs could retry indefinitely.
Risk: Infinite loops, wasted compute, noisy logs, recurring DeepL failures.
Fix: Enforced `WORKER_MAX_JOB_ATTEMPTS` using queue `attempts` field; mark job failed when exceeded.
Verified: ✅ Attempts are incremented atomically at claim time; worker fails job beyond threshold.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #7
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: DeepL rate limiting backoff
File: `lib/deeplClient.ts` and `lib/retry.ts`
Problem: 429 responses were retried with generic backoff; `Retry-After` header was ignored.
Risk: Thundering herd retries and prolonged rate-limit windows.
Fix: Parse `Retry-After` (seconds or HTTP date) into `retryAfterMs`, and make `retryWithBackoff` honor it when present.
Code:

```ts
if (response.status === 429) error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
```

Verified: ✅ Retry framework supports server-directed delays.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Segmenter correctness / cost efficiency
File: `lib/segmenter.ts`
Problem: Script/style content could leak into segments (especially when using block-level containers), wasting DeepL calls and potentially translating executable text.
Risk: Higher costs, poor translations, potential security surprises if output is re-injected.
Fix:

- Skip `script/style/noscript` nodes during traversal
- Filter text extraction to exclude skipped subtrees (even when the container tag is segmented)
- Extract additional user-facing attributes (`aria-label`, `placeholder`) and include `<div>` as a block-level segment source (with filtering)

Verified: ✅ `tests/segmenter.test.ts` asserts script/style text is excluded while attributes are captured.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ PIPELINE ISSUE #9
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: Worker lifecycle + observability
File: `workers/translationWorker.js`
Problem: Single-threaded polling without heartbeat/concurrency controls makes it harder to tune throughput and observe liveness.
Risk: Poor scaling characteristics and debugging difficulty.
Fix:

- Added configurable `WORKER_CONCURRENCY` (default 1) with a bounded in-flight pool
- Added heartbeat logging every `WORKER_HEARTBEAT_MS`
- On shutdown, stop claiming new work and wait for in-flight work to settle

Verified: ✅ No busy loop; bounded concurrency prevents runaway load.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## Remaining gaps / future work (not fully solvable without product requirements)

- **True job-level deduplication semantics**: current idempotency is keyed on `(site_id, idempotency_key)` when a caller provides an `Idempotency-Key`. “Same URL + locales” dedupe requires defining canonical job identity (URL normalization + locale set + segmentation version) and may be product-dependent.
- **Per-segment status**: currently `translated_text IS NULL` is the status. If you want richer states (pending/translated/failed), add a `status` + `error` column to `translation_segments`.
- **Global DeepL rate limiting across workers**: to enforce plan-wide QPS, add a shared token bucket (DB/Redis) or use an egress proxy with rate limiting.

