/*
  # Strict RLS Policy Enforcement for Vistro-Lite

  ## Security Model
  - End users: authenticated users via Supabase Auth
  - Workers: service_role key (bypasses RLS)
  - Public/anon: NO ACCESS to any table

  ## Access Rules by Table

  ### translation_jobs
  - INSERT: authenticated users (must set user_id = auth.uid())
  - SELECT: authenticated users (only their own jobs)
  - UPDATE/DELETE: service role only

  ### translation_segments
  - SELECT: authenticated users (only segments of their jobs)
  - INSERT/UPDATE/DELETE: service role only

  ### translation_results
  - SELECT: authenticated users (only results of their jobs)
  - INSERT/UPDATE/DELETE: service role only

  ### translation_memory
  - ALL operations: service role only
  - NO end-user access (shared cache managed by workers)

  ### job_queue
  - ALL operations: service role only

  ### webhook_events
  - ALL operations: service role only

  ### orders
  - SELECT: authenticated users (only their own orders)
  - INSERT/UPDATE/DELETE: service role only

  ### subscriptions
  - SELECT: authenticated users (only their own subscriptions)
  - INSERT/UPDATE/DELETE: service role only

  ## Policy Design
  - Explicit allow-lists only
  - No trust in client-side validation
  - Foreign key traversal for access control on child tables
  - Service role policies for worker operations
*/

-- ============================================================================
-- DROP ALL EXISTING POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own jobs" ON translation_jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON translation_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON translation_jobs;

DROP POLICY IF EXISTS "Users can view segments of own jobs" ON translation_segments;
DROP POLICY IF EXISTS "Users can insert segments for own jobs" ON translation_segments;
DROP POLICY IF EXISTS "Users can update segments of own jobs" ON translation_segments;

DROP POLICY IF EXISTS "Users can view results of own jobs" ON translation_results;
DROP POLICY IF EXISTS "Service role can insert results" ON translation_results;

DROP POLICY IF EXISTS "Authenticated users can read translation memory" ON translation_memory;
DROP POLICY IF EXISTS "Service role can insert translation memory" ON translation_memory;
DROP POLICY IF EXISTS "Service role can update translation memory" ON translation_memory;

DROP POLICY IF EXISTS "Service role can manage job queue" ON job_queue;

DROP POLICY IF EXISTS "Users can view webhooks for own jobs" ON webhook_events;
DROP POLICY IF EXISTS "Service role can manage webhook events" ON webhook_events;

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Service role can manage orders" ON orders;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;

-- ============================================================================
-- TRANSLATION_JOBS: User read/create, Service role full control
-- ============================================================================

CREATE POLICY "users_select_own_jobs"
  ON translation_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_jobs"
  ON translation_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_update_jobs"
  ON translation_jobs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_jobs"
  ON translation_jobs
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TRANSLATION_SEGMENTS: User read via job ownership, Service role manages
-- ============================================================================

CREATE POLICY "users_select_own_job_segments"
  ON translation_segments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_segments.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "service_insert_segments"
  ON translation_segments
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_segments"
  ON translation_segments
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_segments"
  ON translation_segments
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TRANSLATION_RESULTS: User read via job ownership, Service role manages
-- ============================================================================

CREATE POLICY "users_select_own_job_results"
  ON translation_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM translation_jobs
      WHERE translation_jobs.id = translation_results.job_id
      AND translation_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "service_insert_results"
  ON translation_results
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_results"
  ON translation_results
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_results"
  ON translation_results
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- TRANSLATION_MEMORY: Service role only (shared cache, no user access)
-- ============================================================================

CREATE POLICY "service_select_translation_memory"
  ON translation_memory
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "service_insert_translation_memory"
  ON translation_memory
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_translation_memory"
  ON translation_memory
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_translation_memory"
  ON translation_memory
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- JOB_QUEUE: Service role only (worker infrastructure)
-- ============================================================================

CREATE POLICY "service_select_job_queue"
  ON job_queue
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "service_insert_job_queue"
  ON job_queue
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_job_queue"
  ON job_queue
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_job_queue"
  ON job_queue
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- WEBHOOK_EVENTS: Service role only (worker infrastructure)
-- ============================================================================

CREATE POLICY "service_select_webhook_events"
  ON webhook_events
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "service_insert_webhook_events"
  ON webhook_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_webhook_events"
  ON webhook_events
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_webhook_events"
  ON webhook_events
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- ORDERS: User read own, Service role manages
-- ============================================================================

CREATE POLICY "users_select_own_orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_insert_orders"
  ON orders
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_orders"
  ON orders
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_orders"
  ON orders
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================================
-- SUBSCRIPTIONS: User read own, Service role manages
-- ============================================================================

CREATE POLICY "users_select_own_subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_insert_subscriptions"
  ON subscriptions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_subscriptions"
  ON subscriptions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_delete_subscriptions"
  ON subscriptions
  FOR DELETE
  TO service_role
  USING (true);