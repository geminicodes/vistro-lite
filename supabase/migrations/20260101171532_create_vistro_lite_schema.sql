/*
  # Vistro-Lite Translation SaaS - Complete Schema

  ## Overview
  Production-grade schema for a translation API service with job queuing,
  translation memory caching, webhook delivery, and subscription management.

  ## Tables

  ### Core Translation Tables
  1. **translation_jobs**
     - Primary job entity tracking translation requests
     - Fields: id, user_id, source_lang, target_lang, status, priority, metadata
     - Status flow: pending → queued → processing → completed/failed

  2. **translation_segments**
     - Individual text segments within a job (many-to-one with jobs)
     - Enables granular progress tracking and parallel processing
     - Fields: id, job_id, source_text, target_text, segment_order, status

  3. **translation_memory**
     - Reusable translation cache across all jobs and users
     - Indexed by language pair and source text hash for fast lookups
     - Fields: id, source_lang, target_lang, source_text, target_text, usage_count

  4. **translation_results**
     - Finalized, structured output for each completed job
     - JSON storage for flexible result formats
     - Fields: id, job_id, result_data

  ### Queue Management
  5. **job_queue**
     - High-concurrency job queue with worker locking
     - Prevents duplicate processing via SELECT FOR UPDATE SKIP LOCKED
     - Auto-releases stale locks via lock_expires_at
     - Fields: job_id, worker_id, locked_at, lock_expires_at, attempts, max_attempts

  ### Integrations
  6. **webhook_events**
     - Reliable webhook delivery with retry logic
     - Tracks delivery attempts and status
     - Fields: id, job_id, event_type, payload, webhook_url, status, attempts

  7. **orders**
     - LemonSqueezy order records
     - One-time purchases and initial subscription orders
     - Fields: id, user_id, lemon_squeezy_id, status, order_data

  8. **subscriptions**
     - LemonSqueezy subscription management
     - Active subscription status and plan tracking
     - Fields: id, user_id, lemon_squeezy_id, status, plan_name, subscription_data

  ## Indexes
  - Optimized for queue polling, TM lookups, and user data access
  - Composite indexes on frequently queried columns

  ## RLS Policies
  - All tables secured with restrictive RLS
  - Users can only access their own jobs, segments, results, orders
  - Translation memory is globally readable (shared resource)

  ## RPC Functions
  - **enqueue_job(uuid)**: Idempotent job enqueuing
  - **fetch_queued_jobs(int, text)**: Concurrent-safe job fetching with locking

  ## Concurrency Safety
  - Job queue uses SKIP LOCKED to prevent duplicate fetches
  - Automatic stale lock cleanup via lock_expires_at checks
  - Idempotent enqueue prevents duplicate queue entries
*/

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

CREATE TYPE job_status AS ENUM (
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE segment_status AS ENUM (
  'pending',
  'completed',
  'failed'
);

CREATE TYPE webhook_status AS ENUM (
  'pending',
  'sent',
  'failed'
);

-- ============================================================================
-- TRANSLATION JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Language configuration
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  
  -- Job state
  status job_status NOT NULL DEFAULT 'pending',
  priority int NOT NULL DEFAULT 0,
  
  -- Flexible metadata storage (API keys, callback URLs, custom params)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Error tracking
  error_message text,
  error_details jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_translation_jobs_user_id ON translation_jobs(user_id);
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX idx_translation_jobs_created_at ON translation_jobs(created_at DESC);

ALTER TABLE translation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON translation_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON translation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON translation_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- TRANSLATION SEGMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
  
  -- Content
  source_text text NOT NULL,
  target_text text,
  
  -- Ordering and state
  segment_order int NOT NULL,
  status segment_status NOT NULL DEFAULT 'pending',
  
  -- Metadata (confidence scores, alternative translations, etc.)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_translation_segments_job_id ON translation_segments(job_id);
CREATE INDEX idx_translation_segments_status ON translation_segments(status);
CREATE UNIQUE INDEX idx_translation_segments_job_order ON translation_segments(job_id, segment_order);

ALTER TABLE translation_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view segments of own jobs"
  ON translation_segments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_segments.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert segments for own jobs"
  ON translation_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_segments.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update segments of own jobs"
  ON translation_segments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_segments.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_segments.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRANSLATION MEMORY (SHARED CACHE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Language pair
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  
  -- Content
  source_text text NOT NULL,
  target_text text NOT NULL,
  
  -- Usage tracking
  usage_count int NOT NULL DEFAULT 1,
  
  -- Quality metadata (confidence, source, etc.)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Critical index for TM lookups - hash index for exact match performance
CREATE INDEX idx_translation_memory_lookup 
  ON translation_memory(source_lang, target_lang, md5(source_text));

-- Prevent duplicate entries
CREATE UNIQUE INDEX idx_translation_memory_unique 
  ON translation_memory(source_lang, target_lang, md5(source_text));

CREATE INDEX idx_translation_memory_usage ON translation_memory(usage_count DESC);

ALTER TABLE translation_memory ENABLE ROW LEVEL SECURITY;

-- Translation memory is a shared resource - all authenticated users can read
CREATE POLICY "Authenticated users can read translation memory"
  ON translation_memory FOR SELECT
  TO authenticated
  USING (true);

-- Only system/workers can write to TM (managed via service role)
CREATE POLICY "Service role can insert translation memory"
  ON translation_memory FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update translation memory"
  ON translation_memory FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRANSLATION RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
  
  -- Structured output (segments array, metadata, stats)
  result_data jsonb NOT NULL,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_translation_results_job_id ON translation_results(job_id);

ALTER TABLE translation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view results of own jobs"
  ON translation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_results.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert results"
  ON translation_results FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- JOB QUEUE (CONCURRENCY-SAFE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_queue (
  job_id uuid PRIMARY KEY REFERENCES translation_jobs(id) ON DELETE CASCADE,
  
  -- Worker lock management
  worker_id text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  
  -- Retry management
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queue polling - worker_id NULL means available
CREATE INDEX idx_job_queue_unlocked ON job_queue(created_at) WHERE worker_id IS NULL;

-- Index for expired locks cleanup
CREATE INDEX idx_job_queue_lock_expires ON job_queue(lock_expires_at);

-- Index for worker tracking
CREATE INDEX idx_job_queue_worker ON job_queue(worker_id) WHERE worker_id IS NOT NULL;

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- Queue is managed by service role only
CREATE POLICY "Service role can manage job queue"
  ON job_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- WEBHOOK EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
  
  -- Event configuration
  event_type text NOT NULL,
  webhook_url text NOT NULL,
  payload jsonb NOT NULL,
  
  -- Delivery tracking
  status webhook_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  
  -- Response tracking
  response_status int,
  response_body text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  next_retry_at timestamptz
);

CREATE INDEX idx_webhook_events_job_id ON webhook_events(job_id);
CREATE INDEX idx_webhook_events_pending 
  ON webhook_events(next_retry_at) 
  WHERE status = 'pending';

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhooks for own jobs"
  ON webhook_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = webhook_events.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage webhook events"
  ON webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ORDERS (LEMONSQUEEZY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- LemonSqueezy integration
  lemon_squeezy_id text NOT NULL UNIQUE,
  status text NOT NULL,
  
  -- Full order data from LemonSqueezy webhook
  order_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE UNIQUE INDEX idx_orders_lemon_squeezy_id ON orders(lemon_squeezy_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage orders"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SUBSCRIPTIONS (LEMONSQUEEZY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- LemonSqueezy integration
  lemon_squeezy_id text NOT NULL UNIQUE,
  status text NOT NULL,
  plan_name text NOT NULL,
  
  -- Full subscription data from LemonSqueezy
  subscription_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE UNIQUE INDEX idx_subscriptions_lemon_squeezy_id ON subscriptions(lemon_squeezy_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RPC FUNCTION: enqueue_job (IDEMPOTENT)
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Idempotent insert - only enqueue if not already in queue
  INSERT INTO job_queue (job_id)
  VALUES (p_job_id)
  ON CONFLICT (job_id) DO NOTHING;
  
  -- Update job status to queued (idempotent)
  UPDATE translation_jobs
  SET 
    status = 'queued',
    updated_at = now()
  WHERE id = p_job_id
  AND status = 'pending';
END;
$$;

-- ============================================================================
-- RPC FUNCTION: fetch_queued_jobs (CONCURRENT-SAFE)
-- ============================================================================

CREATE OR REPLACE FUNCTION fetch_queued_jobs(
  p_limit int DEFAULT 10,
  p_worker text DEFAULT 'default-worker'
)
RETURNS TABLE(
  job_id uuid,
  user_id uuid,
  source_lang text,
  target_lang text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_duration interval := interval '5 minutes';
BEGIN
  -- Lock available jobs using SKIP LOCKED for safe concurrency
  -- This ensures multiple workers never fetch the same job
  RETURN QUERY
  WITH locked_jobs AS (
    UPDATE job_queue jq
    SET 
      worker_id = p_worker,
      locked_at = now(),
      lock_expires_at = now() + v_lock_duration,
      attempts = attempts + 1
    WHERE jq.job_id IN (
      SELECT jq2.job_id
      FROM job_queue jq2
      WHERE (
        -- Job is unlocked
        (jq2.worker_id IS NULL)
        OR
        -- Job lock has expired
        (jq2.lock_expires_at < now())
      )
      AND jq2.attempts < jq2.max_attempts
      ORDER BY jq2.created_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING jq.job_id
  )
  SELECT 
    tj.id AS job_id,
    tj.user_id,
    tj.source_lang,
    tj.target_lang,
    tj.metadata
  FROM locked_jobs lj
  JOIN translation_jobs tj ON tj.id = lj.job_id;
  
  -- Update job status to processing
  UPDATE translation_jobs
  SET 
    status = 'processing',
    updated_at = now()
  WHERE id IN (
    SELECT locked_jobs.job_id FROM locked_jobs
  );
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: release_job_lock
-- ============================================================================

CREATE OR REPLACE FUNCTION release_job_lock(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE job_queue
  SET 
    worker_id = NULL,
    locked_at = NULL,
    lock_expires_at = NULL
  WHERE job_id = p_job_id;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: complete_job
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_job(
  p_job_id uuid,
  p_result_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update job status
  UPDATE translation_jobs
  SET 
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_job_id;
  
  -- Store result
  INSERT INTO translation_results (job_id, result_data)
  VALUES (p_job_id, p_result_data)
  ON CONFLICT (job_id) DO UPDATE
  SET result_data = EXCLUDED.result_data;
  
  -- Remove from queue
  DELETE FROM job_queue WHERE job_id = p_job_id;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: fail_job
-- ============================================================================

CREATE OR REPLACE FUNCTION fail_job(
  p_job_id uuid,
  p_error_message text,
  p_error_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update job status
  UPDATE translation_jobs
  SET 
    status = 'failed',
    error_message = p_error_message,
    error_details = p_error_details,
    updated_at = now()
  WHERE id = p_job_id;
  
  -- Remove from queue
  DELETE FROM job_queue WHERE job_id = p_job_id;
END;
$$;

-- ============================================================================
-- AUTOMATIC UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_translation_jobs_updated_at
  BEFORE UPDATE ON translation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translation_segments_updated_at
  BEFORE UPDATE ON translation_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translation_memory_updated_at
  BEFORE UPDATE ON translation_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();