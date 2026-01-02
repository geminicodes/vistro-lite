/*
  # Add Zombie Job Cleanup Mechanism

  1. Purpose
    - Automatically detect and clean up "zombie jobs"
    - Zombie jobs are jobs stuck in 'processing' state with no active queue entry
    - This happens when a worker crashes during complete_job() execution

  2. Changes
    - Enable pg_cron extension for scheduled tasks
    - Create cleanup function to detect zombie jobs
    - Schedule cleanup to run every 5 minutes
    - Add indexes for efficient zombie detection

  3. Detection Logic
    - Jobs in 'processing' state
    - Job's updated_at is older than 30 minutes (configurable timeout)
    - No corresponding entry in job_queue table
    - Not already marked as failed

  4. Cleanup Action
    - Reset job status to 'pending'
    - Create new queue entry with exponential backoff
    - Log cleanup action for monitoring
    - Increment retry counter
*/

-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cleanup function to detect and reset zombie jobs
CREATE OR REPLACE FUNCTION cleanup_zombie_jobs()
RETURNS TABLE (
  cleaned_job_id uuid,
  job_name text,
  stuck_duration interval
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  zombie_timeout interval := interval '30 minutes';
  v_job_id uuid;
  v_priority int;
  v_retry_count int;
  v_max_retries int := 5;
BEGIN
  -- Find zombie jobs: processing status, no queue entry, timeout exceeded
  FOR v_job_id IN
    SELECT j.id
    FROM translation_jobs j
    WHERE j.status = 'processing'
      AND j.updated_at < now() - zombie_timeout
      AND NOT EXISTS (
        SELECT 1
        FROM job_queue q
        WHERE q.job_id = j.id
      )
      AND j.retry_count < v_max_retries
  LOOP
    -- Get current retry count and calculate priority
    SELECT retry_count INTO v_retry_count
    FROM translation_jobs
    WHERE id = v_job_id;

    -- Calculate priority with exponential backoff
    v_priority := GREATEST(1, 10 - (v_retry_count * 2));

    -- Reset job to pending status
    UPDATE translation_jobs
    SET
      status = 'pending',
      retry_count = retry_count + 1,
      updated_at = now()
    WHERE id = v_job_id;

    -- Re-add to job queue with lower priority
    INSERT INTO job_queue (job_id, priority, created_at)
    VALUES (v_job_id, v_priority, now())
    ON CONFLICT (job_id) DO NOTHING;

    -- Return cleaned job info for logging
    RETURN QUERY
    SELECT
      j.id,
      j.source_lang || '->' || j.target_lang AS job_name,
      now() - j.updated_at AS stuck_duration
    FROM translation_jobs j
    WHERE j.id = v_job_id;
  END LOOP;

  -- Mark jobs that exceeded max retries as failed
  UPDATE translation_jobs
  SET
    status = 'failed',
    error_message = 'Job exceeded maximum retry count after worker crashes',
    updated_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - zombie_timeout
    AND NOT EXISTS (
      SELECT 1
      FROM job_queue q
      WHERE q.job_id = translation_jobs.id
    )
    AND retry_count >= v_max_retries;

  RETURN;
END;
$$;

-- Add index to speed up zombie job detection
CREATE INDEX IF NOT EXISTS idx_jobs_zombie_detection
ON translation_jobs(status, updated_at)
WHERE status = 'processing';

-- Schedule cleanup job to run every 5 minutes
-- Note: pg_cron requires superuser or rds_superuser role
-- In Supabase, this is typically pre-configured
DO $$
BEGIN
  -- Remove existing schedule if it exists
  PERFORM cron.unschedule('cleanup-zombie-jobs');
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not fully initialized yet, will be handled on next run
    NULL;
  WHEN OTHERS THEN
    -- Job doesn't exist, that's fine
    NULL;
END $$;

-- Schedule the cleanup job
SELECT cron.schedule(
  'cleanup-zombie-jobs',           -- Job name
  '*/5 * * * *',                   -- Every 5 minutes
  'SELECT cleanup_zombie_jobs();'  -- SQL to execute
);

-- Grant execute permission on cleanup function
GRANT EXECUTE ON FUNCTION cleanup_zombie_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_zombie_jobs() TO service_role;

-- Create a manual trigger function for testing/debugging
CREATE OR REPLACE FUNCTION trigger_zombie_cleanup()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Run cleanup and collect results
  SELECT json_agg(row_to_json(cleanup_result))
  INTO result
  FROM cleanup_zombie_jobs() cleanup_result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

COMMENT ON FUNCTION cleanup_zombie_jobs() IS
'Automatically detects and resets zombie jobs (jobs stuck in processing with no queue entry)';

COMMENT ON FUNCTION trigger_zombie_cleanup() IS
'Manual trigger for zombie job cleanup - useful for testing and debugging';
