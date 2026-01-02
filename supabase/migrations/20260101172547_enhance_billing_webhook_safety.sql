/*
  # Enhance Billing Tables for Webhook Idempotency

  ## Changes
  1. Add refund tracking to orders table
     - refunded boolean flag
     - refunded_at timestamp
     - refund_reason text
  
  2. Create billing_webhook_events table
     - Immutable log of all LemonSqueezy webhooks
     - Indexed by lemon_squeezy_event_id for deduplication
     - Prevents duplicate webhook processing
  
  3. Add indexes for webhook lookup
     - Fast event_id lookups for idempotency checks
     - Fast order/subscription lookups by external ID

  ## Webhook Safety
  - billing_webhook_events.lemon_squeezy_event_id is UNIQUE
  - INSERT ... ON CONFLICT DO NOTHING for idempotent webhook handlers
  - All webhook data preserved in immutable JSONB log
  
  ## Refund Handling
  - orders.refunded flag for quick filtering
  - orders.refunded_at for audit trail
  - Full refund metadata in order_data JSONB
*/

-- ============================================================================
-- ENHANCE ORDERS TABLE: Add refund tracking
-- ============================================================================

DO $$
BEGIN
  -- Add refunded flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded'
  ) THEN
    ALTER TABLE orders ADD COLUMN refunded boolean NOT NULL DEFAULT false;
  END IF;

  -- Add refund timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN refunded_at timestamptz;
  END IF;

  -- Add refund reason/notes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_reason'
  ) THEN
    ALTER TABLE orders ADD COLUMN refund_reason text;
  END IF;
END $$;

-- Index for filtering refunded orders
CREATE INDEX IF NOT EXISTS idx_orders_refunded 
ON orders(refunded) WHERE refunded = true;

-- ============================================================================
-- CREATE BILLING_WEBHOOK_EVENTS: Immutable webhook log
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- LemonSqueezy event identification
  lemon_squeezy_event_id text NOT NULL UNIQUE,
  event_name text NOT NULL,
  
  -- Related entities (nullable - not all webhooks have these)
  order_id text,
  subscription_id text,
  customer_id text,
  
  -- Full webhook payload (immutable)
  payload jsonb NOT NULL,
  
  -- Processing metadata
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  
  -- Timestamps
  received_at timestamptz NOT NULL DEFAULT now(),
  
  -- Idempotency: attempts to process same event
  process_attempts int NOT NULL DEFAULT 0
);

-- ============================================================================
-- INDEXES FOR WEBHOOK OPERATIONS
-- ============================================================================

-- Primary deduplication index: Ensures webhook idempotency
-- Query: INSERT ... ON CONFLICT (lemon_squeezy_event_id) DO NOTHING
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhooks_event_id 
ON billing_webhook_events(lemon_squeezy_event_id);

-- Fast lookup by event type for debugging/monitoring
CREATE INDEX IF NOT EXISTS idx_billing_webhooks_event_name 
ON billing_webhook_events(event_name, received_at DESC);

-- Fast lookup by order for reconciliation
CREATE INDEX IF NOT EXISTS idx_billing_webhooks_order_id 
ON billing_webhook_events(order_id) WHERE order_id IS NOT NULL;

-- Fast lookup by subscription for reconciliation
CREATE INDEX IF NOT EXISTS idx_billing_webhooks_subscription_id 
ON billing_webhook_events(subscription_id) WHERE subscription_id IS NOT NULL;

-- Unprocessed webhooks queue
CREATE INDEX IF NOT EXISTS idx_billing_webhooks_unprocessed 
ON billing_webhook_events(received_at) WHERE processed = false;

-- ============================================================================
-- RLS POLICIES FOR BILLING_WEBHOOK_EVENTS
-- ============================================================================

ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role only: Webhooks are infrastructure, not user-facing
CREATE POLICY "service_select_billing_webhooks"
  ON billing_webhook_events FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "service_insert_billing_webhooks"
  ON billing_webhook_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update_billing_webhooks"
  ON billing_webhook_events FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTION: Idempotent webhook insert
-- ============================================================================

CREATE OR REPLACE FUNCTION record_billing_webhook(
  p_event_id text,
  p_event_name text,
  p_payload jsonb,
  p_order_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_customer_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_id uuid;
BEGIN
  -- Idempotent insert: same event_id returns existing record
  INSERT INTO billing_webhook_events (
    lemon_squeezy_event_id,
    event_name,
    payload,
    order_id,
    subscription_id,
    customer_id
  )
  VALUES (
    p_event_id,
    p_event_name,
    p_payload,
    p_order_id,
    p_subscription_id,
    p_customer_id
  )
  ON CONFLICT (lemon_squeezy_event_id) DO UPDATE
  SET process_attempts = billing_webhook_events.process_attempts + 1
  RETURNING id INTO v_webhook_id;
  
  RETURN v_webhook_id;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: Mark webhook as processed
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_webhook_processed(
  p_event_id text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE billing_webhook_events
  SET 
    processed = CASE WHEN p_error IS NULL THEN true ELSE false END,
    processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
    processing_error = p_error,
    process_attempts = process_attempts + 1
  WHERE lemon_squeezy_event_id = p_event_id;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: Upsert order (idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_order(
  p_user_id uuid,
  p_lemon_squeezy_id text,
  p_status text,
  p_order_data jsonb,
  p_refunded boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO orders (
    user_id,
    lemon_squeezy_id,
    status,
    order_data,
    refunded
  )
  VALUES (
    p_user_id,
    p_lemon_squeezy_id,
    p_status,
    p_order_data,
    p_refunded
  )
  ON CONFLICT (lemon_squeezy_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    order_data = EXCLUDED.order_data,
    refunded = EXCLUDED.refunded,
    refunded_at = CASE 
      WHEN EXCLUDED.refunded = true AND orders.refunded = false 
      THEN now() 
      ELSE orders.refunded_at 
    END,
    updated_at = now()
  RETURNING id INTO v_order_id;
  
  RETURN v_order_id;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: Upsert subscription (idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_subscription(
  p_user_id uuid,
  p_lemon_squeezy_id text,
  p_status text,
  p_plan_name text,
  p_subscription_data jsonb,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
BEGIN
  INSERT INTO subscriptions (
    user_id,
    lemon_squeezy_id,
    status,
    plan_name,
    subscription_data,
    expires_at
  )
  VALUES (
    p_user_id,
    p_lemon_squeezy_id,
    p_status,
    p_plan_name,
    p_subscription_data,
    p_expires_at
  )
  ON CONFLICT (lemon_squeezy_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    plan_name = EXCLUDED.plan_name,
    subscription_data = EXCLUDED.subscription_data,
    expires_at = EXCLUDED.expires_at,
    cancelled_at = CASE 
      WHEN EXCLUDED.status IN ('cancelled', 'expired') AND subscriptions.cancelled_at IS NULL 
      THEN now() 
      ELSE subscriptions.cancelled_at 
    END,
    updated_at = now()
  RETURNING id INTO v_subscription_id;
  
  RETURN v_subscription_id;
END;
$$;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE billing_webhook_events IS 
  'Immutable log of all LemonSqueezy webhooks. Ensures idempotent webhook processing via unique event IDs.';

COMMENT ON COLUMN billing_webhook_events.lemon_squeezy_event_id IS 
  'Unique event ID from LemonSqueezy. Used for webhook deduplication.';

COMMENT ON FUNCTION record_billing_webhook IS 
  'Idempotent webhook insertion. Same event_id increments process_attempts but does not duplicate.';

COMMENT ON FUNCTION upsert_order IS 
  'Idempotent order upsert. Safe for webhook replay.';

COMMENT ON FUNCTION upsert_subscription IS 
  'Idempotent subscription upsert. Safe for webhook replay.';