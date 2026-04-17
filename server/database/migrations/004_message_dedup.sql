-- ================================================================
-- Migration 004 — Webhook Message Deduplication (P1-02)
-- ================================================================
-- Meta retries the webhook if it doesn't receive 200 within ~5 seconds.
-- The in-memory dedup Map in webhook.routes.js works within a single warm
-- Lambda container, but cold starts clear it — and two Lambda instances
-- processing the same retry concurrently would each reply to the customer,
-- producing a duplicate WhatsApp message from our end.
--
-- This migration adds a PARTIAL UNIQUE INDEX on messages(message_id) so:
--   1. A pre-processing DB lookup can short-circuit duplicates across cold
--      starts and parallel invocations.
--   2. If two instances race past that pre-check, the second `INSERT` into
--      `messages` fails with SQLSTATE 23505 — caught by db.saveConversation
--      and treated as a benign no-op rather than a data-loss error.
--
-- Why partial: some code paths (e.g. fallback error logging) may insert a
-- message row without a Meta message_id. NULL values must be allowed to
-- co-exist, so the predicate excludes them from uniqueness.
--
-- Idempotent: uses `IF NOT EXISTS`. Safe to re-run.
--
-- HOW TO VERIFY after running:
--   SELECT indexname, indexdef FROM pg_indexes
--     WHERE tablename = 'messages' AND indexname = 'idx_messages_message_id_unique';
--   -- Should return one row showing the partial unique index.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id_unique
    ON messages (message_id)
    WHERE message_id IS NOT NULL;

COMMENT ON INDEX idx_messages_message_id_unique IS
    'P1-02: prevents duplicate webhook processing. A second insert for the '
    'same Meta message_id raises SQLSTATE 23505 — db.js saveConversation '
    'catches this and returns the existing row instead of double-storing.';

-- Optional: also add a lookup index for the pre-check (redundant but
-- explicit — Postgres will use the unique index above for the lookup too,
-- this is kept for clarity only).
-- Not needed. The UNIQUE index already serves equality lookups.

-- ----------------------------------------------------------------
-- Verification helpers — run these to audit after deploy
-- ----------------------------------------------------------------
-- Show the unique index:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'messages' AND indexname = 'idx_messages_message_id_unique';
--
-- Synthetic collision test (expect the second INSERT to fail with 23505):
--   BEGIN;
--   INSERT INTO messages (phone_number, customer_message, ai_response, message_id)
--     VALUES ('+962700000001', 'hi',  'مرحبا', 'wamid.TEST_1');
--   INSERT INTO messages (phone_number, customer_message, ai_response, message_id)
--     VALUES ('+962700000001', 'hi2', 'مرحبا', 'wamid.TEST_1');
--   ROLLBACK;
