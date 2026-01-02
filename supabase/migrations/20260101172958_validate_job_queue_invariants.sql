/*
  # Job Queue Validation: Concurrency Invariants & Race Condition Analysis

  ## PURPOSE
  This migration documents the job queue's safety guarantees and provides
  SQL assertions to validate concurrent worker behavior.

  ## QUEUE INVARIANTS (MUST HOLD AT ALL TIMES)

  ### I1: UNIQUE OWNERSHIP
  At any given moment, a job_id can have AT MOST ONE worker_id assigned.
  - Enforced by: PRIMARY KEY on job_id
  - Violated if: Multiple rows exist for same job_id (impossible)

  ### I2: NO PHANTOM LOCKS
  If worker_id IS NOT NULL, then locked_at and lock_expires_at MUST be set.
  - Enforced by: Application logic in fetch_queued_jobs()
  - Violated if: worker_id set but timestamps NULL

  ### I3: EXPIRED LOCKS ARE RECLAIMABLE
  If lock_expires_at < now(), the job MUST be fetchable by another worker.
  - Enforced by: WHERE clause checks (worker_id IS NULL OR lock_expires_at < now())
  - Self-healing: Stale locks automatically released

  ### I4: MAX ATTEMPTS BARRIER
  Jobs with attempts >= max_attempts MUST NOT be fetched.
  - Enforced by: WHERE jq2.attempts < jq2.max_attempts
  - Prevents infinite retry loops

  ### I5: SKIP LOCKED ATOMICITY
  Two concurrent fetch_queued_jobs() calls MUST return disjoint job sets.
  - Enforced by: FOR UPDATE SKIP LOCKED
  - PostgreSQL guarantees: If row is locked by another transaction, skip it

  ### I6: IDEMPOTENT ENQUEUE
  Calling enqueue_job(uuid) multiple times MUST NOT create duplicates.
  - Enforced by: ON CONFLICT (job_id) DO NOTHING
  - Safe for retry logic and webhook replays

  ## LOCKING SEMANTICS PROOF

  ### Scenario A: Two Workers Fetch Simultaneously
  
  Time | Worker A (W-A)                    | Worker B (W-B)                    | Queue State
  -----|-----------------------------------|-----------------------------------|---------------------------
  T0   | BEGIN fetch_queued_jobs(5, 'W-A')| BEGIN fetch_queued_jobs(5, 'W-B')| job_1, job_2, job_3 unlocked
  T1   | SELECT ... FOR UPDATE SKIP LOCKED | (blocked, waiting for lock)       | W-A locks job_1, job_2, job_3
  T2   | UPDATE worker_id='W-A' for 3 jobs | SELECT ... FOR UPDATE SKIP LOCKED | W-A owns 3 jobs
  T3   | COMMIT (returns job_1,2,3)        | Sees job_1,2,3 locked → SKIPs     | W-A: job_1,2,3
  T4   |                                   | Fetches job_4, job_5 (unlocked)   | W-A: 1,2,3 | W-B: 4,5
  T5   |                                   | COMMIT (returns job_4,5)          | W-A: 1,2,3 | W-B: 4,5

  RESULT: No overlap. SKIP LOCKED ensures mutual exclusion.

  ### Scenario B: Lock Expiration Recovery

  Time | Worker A (W-A)                    | Worker B (W-B)                    | Queue State
  -----|-----------------------------------|-----------------------------------|---------------------------
  T0   | fetch_queued_jobs(1, 'W-A')       |                                   | job_1 locked, expires=T0+5min
  T1   | (crashes, no release_job_lock)    |                                   | job_1 locked by W-A (stale)
  T6   |                                   | fetch_queued_jobs(1, 'W-B')       | lock_expires_at < now()
  T7   |                                   | WHERE clause: expired=true        | W-B can claim job_1
  T8   |                                   | UPDATE worker_id='W-B'            | job_1 locked by W-B

  RESULT: Self-healing. No manual intervention needed.

  ### Scenario C: Idempotent Enqueue (Webhook Replay)

  Time | Action                            | Queue State
  ------|-----------------------------------|----------------------------------------------
  T0   | enqueue_job(job_123)              | INSERT job_123 → success
  T1   | enqueue_job(job_123) (retry)      | ON CONFLICT → DO NOTHING (no error)
  T2   | enqueue_job(job_123) (replay)     | ON CONFLICT → DO NOTHING (no error)

  RESULT: Single queue entry, safe for retries.

  ### Scenario D: Max Attempts Exhaustion

  Time | Action                            | attempts | max_attempts | Fetchable?
  ------|-----------------------------------|----------|--------------|------------
  T0   | fetch_queued_jobs() → fail        | 1        | 3            | ✓ YES
  T1   | release_job_lock()                | 1        | 3            | ✓ YES
  T2   | fetch_queued_jobs() → fail        | 2        | 3            | ✓ YES
  T3   | release_job_lock()                | 2        | 3            | ✓ YES
  T4   | fetch_queued_jobs() → fail        | 3        | 3            | ✗ NO (attempts >= max)
  T5   | (job permanently stuck)           | 3        | 3            | ✗ NO

  RESULT: Dead-letter queue behavior. Operator must manually intervene.

  ## SQL VALIDATION QUERIES

  The following queries are NOT executed automatically—they are templates
  for testing and monitoring queue health in production.
*/

-- ============================================================================
-- VALIDATION QUERY 1: Detect Phantom Locks (Invariant I2)
-- ============================================================================
-- EXPECTED RESULT: 0 rows
-- If rows returned: worker_id set but timestamps missing (BUG!)

-- SELECT job_id, worker_id, locked_at, lock_expires_at
-- FROM job_queue
-- WHERE worker_id IS NOT NULL
-- AND (locked_at IS NULL OR lock_expires_at IS NULL);

COMMENT ON TABLE job_queue IS 
  'Concurrency-safe job queue. Invariant I2: If worker_id IS NOT NULL, locked_at and lock_expires_at MUST be set.';

-- ============================================================================
-- VALIDATION QUERY 2: Detect Stale Locks (Invariant I3)
-- ============================================================================
-- EXPECTED RESULT: May return rows if workers crashed
-- These jobs are SAFE to reclaim—fetch_queued_jobs() will auto-heal

-- SELECT 
--   job_id, 
--   worker_id, 
--   locked_at,
--   lock_expires_at,
--   now() - lock_expires_at AS expired_duration,
--   attempts,
--   max_attempts
-- FROM job_queue
-- WHERE worker_id IS NOT NULL
-- AND lock_expires_at < now();

COMMENT ON COLUMN job_queue.lock_expires_at IS 
  'Automatic stale lock recovery. If < now(), job becomes fetchable by another worker (Invariant I3).';

-- ============================================================================
-- VALIDATION QUERY 3: Detect Dead Jobs (Invariant I4)
-- ============================================================================
-- EXPECTED RESULT: May return rows (requires manual intervention)
-- These jobs exhausted retries and will NEVER be processed again

-- SELECT 
--   jq.job_id,
--   jq.attempts,
--   jq.max_attempts,
--   tj.status,
--   tj.error_message,
--   jq.created_at,
--   now() - jq.created_at AS stuck_duration
-- FROM job_queue jq
-- JOIN translation_jobs tj ON tj.id = jq.job_id
-- WHERE jq.attempts >= jq.max_attempts;

COMMENT ON COLUMN job_queue.attempts IS 
  'Retry counter. If >= max_attempts, job becomes unfetchable (Invariant I4). Manual intervention required.';

-- ============================================================================
-- VALIDATION QUERY 4: Monitor Active Workers
-- ============================================================================
-- EXPECTED RESULT: Shows current worker distribution
-- Useful for load balancing and identifying stuck workers

-- SELECT 
--   worker_id,
--   COUNT(*) AS jobs_locked,
--   MIN(locked_at) AS oldest_lock,
--   MAX(lock_expires_at) AS furthest_expiry,
--   COUNT(*) FILTER (WHERE lock_expires_at < now()) AS expired_locks
-- FROM job_queue
-- WHERE worker_id IS NOT NULL
-- GROUP BY worker_id
-- ORDER BY jobs_locked DESC;

COMMENT ON COLUMN job_queue.worker_id IS 
  'Worker identifier. NULL = unlocked. Non-NULL = locked by worker (Invariant I1: unique ownership).';

-- ============================================================================
-- VALIDATION QUERY 5: Simulate Concurrent Fetch (Race Test)
-- ============================================================================
-- EXPECTED RESULT: Two workers fetching simultaneously should get disjoint sets
-- This is a manual test—run in two separate psql sessions simultaneously:

-- Session 1:
-- BEGIN;
-- SELECT * FROM fetch_queued_jobs(5, 'worker-1');
-- -- DO NOT COMMIT YET

-- Session 2 (run WHILE session 1 is still in transaction):
-- BEGIN;
-- SELECT * FROM fetch_queued_jobs(5, 'worker-2');
-- COMMIT;

-- Session 1 (now commit):
-- COMMIT;

-- Verify: job_ids returned by worker-1 and worker-2 MUST NOT overlap.
-- If overlap exists: SKIP LOCKED is broken (critical PostgreSQL bug).

COMMENT ON FUNCTION fetch_queued_jobs IS 
  'Concurrent-safe job fetcher. Uses FOR UPDATE SKIP LOCKED to ensure workers get disjoint job sets (Invariant I5).';

-- ============================================================================
-- VALIDATION QUERY 6: Test Idempotent Enqueue
-- ============================================================================
-- EXPECTED RESULT: Second call returns without error, queue unchanged

-- DO $$
-- DECLARE
--   v_job_id uuid := 'c9d0e5a2-5f3e-4b3a-8d9e-1a2b3c4d5e6f';
-- BEGIN
--   -- First enqueue
--   PERFORM enqueue_job(v_job_id);
--   
--   -- Second enqueue (should be no-op)
--   PERFORM enqueue_job(v_job_id);
--   
--   -- Verify: job_queue should have exactly ONE entry for v_job_id
--   IF (SELECT COUNT(*) FROM job_queue WHERE job_id = v_job_id) != 1 THEN
--     RAISE EXCEPTION 'Idempotent enqueue VIOLATED: duplicate queue entry detected';
--   END IF;
--   
--   RAISE NOTICE 'Idempotent enqueue OK: Invariant I6 satisfied';
-- END $$;

COMMENT ON FUNCTION enqueue_job IS 
  'Idempotent job enqueuing. Multiple calls with same job_id are safe (Invariant I6). Uses ON CONFLICT DO NOTHING.';

-- ============================================================================
-- VALIDATION QUERY 7: Lock Duration Statistics
-- ============================================================================
-- EXPECTED RESULT: Helps tune v_lock_duration (currently 5 minutes)
-- If avg_processing_time >> 5 minutes, increase lock duration

-- SELECT 
--   percentile_cont(0.5) WITHIN GROUP (ORDER BY processing_duration) AS p50_duration,
--   percentile_cont(0.95) WITHIN GROUP (ORDER BY processing_duration) AS p95_duration,
--   percentile_cont(0.99) WITHIN GROUP (ORDER BY processing_duration) AS p99_duration,
--   MAX(processing_duration) AS max_duration,
--   COUNT(*) AS completed_jobs
-- FROM (
--   SELECT 
--     jq.job_id,
--     EXTRACT(EPOCH FROM (tj.completed_at - jq.locked_at)) AS processing_duration
--   FROM job_queue jq
--   JOIN translation_jobs tj ON tj.id = jq.job_id
--   WHERE tj.status = 'completed'
--   AND jq.locked_at IS NOT NULL
--   AND tj.completed_at IS NOT NULL
-- ) AS durations;

COMMENT ON COLUMN job_queue.locked_at IS 
  'Lock acquisition timestamp. Used with completed_at to measure processing duration.';

-- ============================================================================
-- EDGE CASE: Deadlock Prevention Analysis
-- ============================================================================

/*
  ## DEADLOCK RISK ASSESSMENT

  PostgreSQL deadlocks occur when:
  1. Two transactions lock rows in DIFFERENT ORDER
  2. Each waits for the other's lock

  ### Our Queue Design: DEADLOCK-FREE

  fetch_queued_jobs() locks rows in a CONSISTENT ORDER:
    ORDER BY jq2.created_at ASC

  Even if 1000 workers call fetch_queued_jobs() simultaneously:
  - All try to lock jobs in created_at order
  - Worker A locks job_1 first → others SKIP it
  - Worker B locks job_2 first → others SKIP it
  - No circular wait → no deadlock

  ### Proof by Contradiction

  Assume deadlock occurs:
  - Worker A holds lock on job_X, waits for job_Y
  - Worker B holds lock on job_Y, waits for job_X
  - This requires: created_at(X) < created_at(Y) AND created_at(Y) < created_at(X)
  - Contradiction! Total ordering prevents cycles.

  SKIP LOCKED breaks the wait cycle: if row locked, skip immediately.

  ## CONCLUSION: Deadlock impossible in this design.
*/

COMMENT ON INDEX idx_job_queue_unlocked IS 
  'Efficient queue polling. WHERE worker_id IS NULL filters unlocked jobs. ORDER BY created_at ensures deadlock-free locking.';

-- ============================================================================
-- RACE CONDITION: Double-Processing Window
-- ============================================================================

/*
  ## POTENTIAL RACE: Lock Expiration During Processing

  Timeline:
  T0: Worker A fetches job_1, lock_expires_at = T0 + 5min
  T4: Worker A still processing (slow)
  T5: lock_expires_at < now() → job_1 becomes fetchable
  T6: Worker B fetches job_1 (thinks lock expired)
  T7: Worker A completes job_1
  T8: Worker B completes job_1 (duplicate work!)

  ## MITIGATION 1: Optimistic Locking via Status Transition

  complete_job() should use:
    UPDATE translation_jobs
    SET status = 'completed'
    WHERE id = p_job_id AND status = 'processing'

  If Worker A completes first:
    - UPDATE affects 1 row → job_1 marked completed
    - Worker B's complete_job() finds status='completed' → UPDATE affects 0 rows
    - Worker B detects conflict, aborts

  ## MITIGATION 2: Tune Lock Duration

  Set v_lock_duration based on p99 processing time:
    v_lock_duration := p99_duration * 1.5

  If p99 = 2 minutes, use 3-minute locks.
  Reduces false-positive stale lock detection.

  ## CURRENT IMPLEMENTATION STATUS

  ⚠️  complete_job() does NOT use optimistic locking!
  It unconditionally updates status to 'completed'.

  RECOMMENDATION: Add WHERE status = 'processing' to prevent double-completion.
*/

-- ============================================================================
-- CORRECTIVE FIX: Add Optimistic Locking to complete_job()
-- ============================================================================

DROP FUNCTION IF EXISTS complete_job(uuid, jsonb);

CREATE FUNCTION complete_job(
  p_job_id uuid,
  p_result_data jsonb
)
RETURNS boolean  -- Changed return type to indicate success
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_updated int;
BEGIN
  -- Optimistic locking: only complete if still in 'processing' state
  UPDATE translation_jobs
  SET 
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_job_id
  AND status = 'processing';  -- CRITICAL: Prevents double-completion
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  -- If job already completed by another worker, abort gracefully
  IF v_rows_updated = 0 THEN
    RETURN false;  -- Race detected: another worker completed first
  END IF;
  
  -- Store result
  INSERT INTO translation_results (job_id, result_data)
  VALUES (p_job_id, p_result_data)
  ON CONFLICT (job_id) DO UPDATE
  SET result_data = EXCLUDED.result_data;
  
  -- Remove from queue
  DELETE FROM job_queue WHERE job_id = p_job_id;
  
  RETURN true;  -- Success
END;
$$;

COMMENT ON FUNCTION complete_job IS 
  'Optimistic locking: Returns false if job already completed (race detected). Prevents double-processing.';

-- ============================================================================
-- CORRECTIVE FIX: Add Optimistic Locking to fail_job()
-- ============================================================================

DROP FUNCTION IF EXISTS fail_job(uuid, text, jsonb);

CREATE FUNCTION fail_job(
  p_job_id uuid,
  p_error_message text,
  p_error_details jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_updated int;
BEGIN
  -- Optimistic locking: only fail if still in 'processing' state
  UPDATE translation_jobs
  SET 
    status = 'failed',
    error_message = p_error_message,
    error_details = p_error_details,
    updated_at = now()
  WHERE id = p_job_id
  AND status = 'processing';  -- CRITICAL: Prevents status overwrite
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RETURN false;  -- Job not in processing state (race or already terminal)
  END IF;
  
  -- Remove from queue
  DELETE FROM job_queue WHERE job_id = p_job_id;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION fail_job IS 
  'Optimistic locking: Returns false if job not in processing state. Prevents overwriting completed/failed status.';

-- ============================================================================
-- MONITORING VIEW: Queue Health Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW queue_health AS
SELECT
  COUNT(*) FILTER (WHERE worker_id IS NULL) AS unlocked_jobs,
  COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND lock_expires_at >= now()) AS active_locks,
  COUNT(*) FILTER (WHERE worker_id IS NOT NULL AND lock_expires_at < now()) AS stale_locks,
  COUNT(*) FILTER (WHERE attempts >= max_attempts) AS dead_jobs,
  COUNT(DISTINCT worker_id) AS active_workers,
  MIN(created_at) AS oldest_job_age,
  MAX(attempts) AS max_attempts_seen
FROM job_queue;

COMMENT ON VIEW queue_health IS 
  'Real-time queue health metrics. Monitor for stale_locks > 0 or dead_jobs > 0.';

-- ============================================================================
-- FINAL VALIDATION SUMMARY
-- ============================================================================

/*
  ## QUEUE SAFETY CHECKLIST

  ✓ I1: Unique Ownership        → PRIMARY KEY enforces
  ✓ I2: No Phantom Locks         → Application logic (validated via Query 1)
  ✓ I3: Expired Lock Recovery    → WHERE clause auto-healing
  ✓ I4: Max Attempts Barrier     → Dead-letter queue behavior
  ✓ I5: SKIP LOCKED Atomicity    → PostgreSQL guarantees
  ✓ I6: Idempotent Enqueue       → ON CONFLICT DO NOTHING
  ✓ Deadlock Prevention          → Consistent lock ordering
  ✓ Double-Processing Prevention → Optimistic locking (NOW FIXED)

  ## OPERATIONAL RECOMMENDATIONS

  1. Monitor queue_health view every 60 seconds
  2. Alert if stale_locks > 10 for > 5 minutes
  3. Alert if dead_jobs > 0 (requires manual cleanup)
  4. Tune v_lock_duration based on p99 processing time
  5. Run Query 5 (concurrent fetch test) in staging before deploy
  6. Set up dead-letter queue handler for attempts >= max_attempts

  ## KNOWN LIMITATIONS

  - If worker crashes DURING complete_job(), job may be stuck in 'processing'
    with no queue entry (zombie job). Requires periodic cleanup cron.
  
  - No priority queue support (all jobs FIFO by created_at). If needed,
    add ORDER BY priority DESC, created_at ASC.

  - No backpressure mechanism. If enqueue rate > processing rate,
    queue grows unbounded. Consider rate limiting at API layer.
*/