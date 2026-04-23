-- Migration 005: Atomic upserts & flow state
-- Run this in Supabase SQL Editor before deploying code that uses it.
--
-- Changes:
--   1. Ensure customers.phone has a UNIQUE constraint (required for ON CONFLICT upsert)
--   2. Add increment_loyalty_points() RPC for atomic point updates
--   3. Add flow_state JSONB column to conversation_states (for future flow engine)

-- 1. customers.phone unique constraint
--    Guard with IF NOT EXISTS equivalent — safe to run multiple times.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_phone_key'
          AND conrelid = 'customers'::regclass
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_phone_key UNIQUE (phone);
    END IF;
END$$;

-- 2. Atomic loyalty-point increment
--    CREATE OR REPLACE is idempotent — safe to re-run.
CREATE OR REPLACE FUNCTION increment_loyalty_points(p_customer_id UUID, p_points INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE customers
    SET loyalty_points = COALESCE(loyalty_points, 0) + p_points,
        updated_at     = NOW()
    WHERE id = p_customer_id;
END;
$$;

-- 3. flow_state column on conversation_states (optional — used by flow engine)
ALTER TABLE conversation_states
    ADD COLUMN IF NOT EXISTS flow_state JSONB DEFAULT NULL;
