/*
  # Queue Monitoring & Alerting System

  ## Overview
  Creates infrastructure for monitoring queue health and logging alerts when unhealthy conditions are detected.

  ## New Tables
  
  ### `queue_alerts_log`
  Stores historical alert records for tracking patterns and debugging issues.
  
  - `id` (uuid, primary key) - Unique identifier for the alert
  - `alert_type` (text) - Type of alert (stale_locks, dead_jobs, high_wait_time, etc.)
  - `severity` (text) - Alert severity level (warning, critical)
  - `metric_name` (text) - Name of the metric that triggered the alert
  - `metric_value` (numeric) - Value of the metric when alert was triggered
  - `threshold` (numeric) - Threshold that was exceeded
  - `message` (text) - Human-readable alert message
  - `metadata` (jsonb) - Additional context about the alert
  - `created_at` (timestamptz) - When the alert was logged
  - `resolved_at` (timestamptz, nullable) - When the alert condition was resolved
  - `resolved_by` (uuid, nullable) - User who marked alert as resolved

  ## New Functions

  ### `check_and_log_queue_alerts()`
  Checks queue health against defined thresholds and logs alerts when conditions are unhealthy.
  Returns the number of new alerts created.

  ### `resolve_queue_alert(alert_id, user_id)`
  Marks an alert as resolved by a specific user.

  ### `get_active_alerts()`
  Returns all unresolved alerts, ordered by severity and creation time.

  ## Security
  - Enable RLS on `queue_alerts_log` table
  - Admin users can view and resolve alerts
  - System can create alerts automatically

  ## Usage
  This migration enables automated monitoring that can be called periodically:
  - From a cron job (GitHub Actions, Supabase Cron, etc.)
  - From the monitoring Edge Function
  - Manually for on-demand health checks
*/

-- Create alerts log table
CREATE TABLE IF NOT EXISTS queue_alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  threshold numeric NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_queue_alerts_active 
  ON queue_alerts_log(created_at DESC) 
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_alerts_severity 
  ON queue_alerts_log(severity, created_at DESC);

-- Enable RLS
ALTER TABLE queue_alerts_log ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view alerts
CREATE POLICY "Authenticated users can view alerts"
  ON queue_alerts_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can insert alerts
CREATE POLICY "Service role can insert alerts"
  ON queue_alerts_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Authenticated users can resolve alerts
CREATE POLICY "Authenticated users can update alerts"
  ON queue_alerts_log
  FOR UPDATE
  TO authenticated
  USING (resolved_at IS NULL)
  WITH CHECK (resolved_at IS NOT NULL);

-- Function to check queue health and log alerts
CREATE OR REPLACE FUNCTION check_and_log_queue_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health record;
  v_alerts_created integer := 0;
BEGIN
  -- Get current queue health
  SELECT * INTO v_health FROM queue_health;

  -- Check for stale locks (CRITICAL)
  IF v_health.stale_locks > 0 THEN
    INSERT INTO queue_alerts_log (
      alert_type, severity, metric_name, metric_value, threshold, message, metadata
    ) VALUES (
      'stale_locks',
      'critical',
      'stale_locks',
      v_health.stale_locks,
      0,
      format('Found %s stale locks - jobs may be stuck', v_health.stale_locks),
      jsonb_build_object(
        'total_processing', v_health.processing_jobs,
        'total_queued', v_health.queued_jobs
      )
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  -- Check for dead jobs (CRITICAL)
  IF v_health.dead_jobs > 0 THEN
    INSERT INTO queue_alerts_log (
      alert_type, severity, metric_name, metric_value, threshold, message, metadata
    ) VALUES (
      'dead_jobs',
      'critical',
      'dead_jobs',
      v_health.dead_jobs,
      0,
      format('Found %s dead jobs - zombie job cleanup needed', v_health.dead_jobs),
      jsonb_build_object(
        'total_failed', v_health.failed_jobs,
        'total_processing', v_health.processing_jobs
      )
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  -- Check for high failure rate (WARNING)
  IF v_health.failed_jobs > 10 AND v_health.total_jobs > 0 THEN
    IF (v_health.failed_jobs::float / v_health.total_jobs::float) > 0.1 THEN
      INSERT INTO queue_alerts_log (
        alert_type, severity, metric_name, metric_value, threshold, message, metadata
      ) VALUES (
        'high_failure_rate',
        'warning',
        'failed_jobs',
        v_health.failed_jobs,
        10,
        format('High failure rate: %s failed out of %s total jobs', 
               v_health.failed_jobs, v_health.total_jobs),
        jsonb_build_object(
          'failure_rate', round((v_health.failed_jobs::float / v_health.total_jobs::float) * 100, 2),
          'total_jobs', v_health.total_jobs
        )
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END IF;

  -- Check for long wait times (WARNING)
  IF v_health.avg_wait_seconds > 300 THEN
    INSERT INTO queue_alerts_log (
      alert_type, severity, metric_name, metric_value, threshold, message, metadata
    ) VALUES (
      'high_wait_time',
      'warning',
      'avg_wait_seconds',
      v_health.avg_wait_seconds,
      300,
      format('Average wait time is %s seconds (threshold: 300s)', 
             round(v_health.avg_wait_seconds)),
      jsonb_build_object(
        'queued_jobs', v_health.queued_jobs,
        'processing_jobs', v_health.processing_jobs
      )
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  -- Check for very old queued jobs (CRITICAL)
  IF v_health.oldest_queued_job_age_seconds > 600 THEN
    INSERT INTO queue_alerts_log (
      alert_type, severity, metric_name, metric_value, threshold, message, metadata
    ) VALUES (
      'stale_queued_job',
      'critical',
      'oldest_queued_job_age_seconds',
      v_health.oldest_queued_job_age_seconds,
      600,
      format('Oldest queued job is %s seconds old (threshold: 600s)', 
             round(v_health.oldest_queued_job_age_seconds)),
      jsonb_build_object(
        'queued_jobs', v_health.queued_jobs,
        'age_minutes', round(v_health.oldest_queued_job_age_seconds / 60)
      )
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  RETURN v_alerts_created;
END;
$$;

-- Function to resolve an alert
CREATE OR REPLACE FUNCTION resolve_queue_alert(
  p_alert_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE queue_alerts_log
  SET 
    resolved_at = now(),
    resolved_by = COALESCE(p_user_id, auth.uid())
  WHERE id = p_alert_id
    AND resolved_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Function to get active alerts
CREATE OR REPLACE FUNCTION get_active_alerts()
RETURNS TABLE (
  id uuid,
  alert_type text,
  severity text,
  metric_name text,
  metric_value numeric,
  threshold numeric,
  message text,
  metadata jsonb,
  created_at timestamptz,
  age_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    id,
    alert_type,
    severity,
    metric_name,
    metric_value,
    threshold,
    message,
    metadata,
    created_at,
    EXTRACT(EPOCH FROM (now() - created_at))::numeric as age_seconds
  FROM queue_alerts_log
  WHERE resolved_at IS NULL
  ORDER BY 
    CASE severity 
      WHEN 'critical' THEN 1 
      WHEN 'warning' THEN 2 
      ELSE 3 
    END,
    created_at DESC;
$$;

-- Create a view for alert statistics
CREATE OR REPLACE VIEW alert_statistics AS
SELECT 
  alert_type,
  severity,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) as active_count,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_count,
  AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - created_at))) as avg_resolution_time_seconds,
  MAX(created_at) as last_occurrence
FROM queue_alerts_log
GROUP BY alert_type, severity
ORDER BY total_count DESC;
