-- ================================================================
-- Migration 003 — Double-Booking Race Prevention (P1-01)
-- ================================================================
-- The bookings table currently has no uniqueness constraint on
-- (branch, preferred_date, preferred_time). Under concurrent webhook
-- invocations (Meta retries, two customers racing, or two cold starts
-- processing in parallel) the agent's "check_branch_availability →
-- createBooking" sequence is not atomic: both can see a slot as free,
-- both insert, and the slot is double-booked.
--
-- This migration adds a PARTIAL UNIQUE INDEX so that the database itself
-- rejects the second insert with SQLSTATE 23505 (unique_violation).
-- The db layer catches that code and returns a structured
-- `{ slot_taken: true }` response instead of throwing; the agent then
-- tells the customer the slot was just booked and re-prompts with fresh
-- availability.
--
-- Why partial: cancelled bookings must not reserve the slot. A fully-
-- unique index would stop a customer from rebooking the same slot after
-- cancelling their first attempt. Only `pending` and `confirmed` rows
-- count toward the uniqueness constraint.
--
-- Idempotent: uses `IF NOT EXISTS`. Safe to re-run.
--
-- HOW TO VERIFY after running:
--   SELECT indexname, indexdef FROM pg_indexes
--     WHERE tablename = 'bookings' AND indexname = 'idx_bookings_slot_unique';
--   -- Should return one row showing the partial unique index.
-- ================================================================

-- Make sure required columns are non-null on the uniqueness path so the
-- index actually covers the slot. NULL values in any component would make
-- the row escape the uniqueness check.
-- (We do NOT alter NOT NULL on these columns — an agent pre-submission
-- validation in agent-tools.js already rejects bookings missing any of
-- them. The index below simply ignores NULL rows via WHERE clause.)

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_unique
    ON bookings (branch, preferred_date, preferred_time)
    WHERE status IN ('pending', 'confirmed')
      AND preferred_date IS NOT NULL
      AND preferred_time IS NOT NULL
      AND branch         IS NOT NULL;

COMMENT ON INDEX idx_bookings_slot_unique IS
    'P1-01: prevents double-booking the same (branch, date, time) slot. '
    'Violations raise SQLSTATE 23505 — db.js createBooking returns '
    '{ slot_taken: true } instead of re-throwing.';

-- ----------------------------------------------------------------
-- Verification helpers — run these to audit after deploy
-- ----------------------------------------------------------------
-- Show the unique index:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'bookings' AND indexname = 'idx_bookings_slot_unique';
--
-- Synthetic collision test (expect the second INSERT to fail with 23505):
--   BEGIN;
--   INSERT INTO bookings (customer_phone, branch, preferred_date, preferred_time, status)
--     VALUES ('+962700000001', 'عمان', '2099-12-31', '09:00', 'pending');
--   INSERT INTO bookings (customer_phone, branch, preferred_date, preferred_time, status)
--     VALUES ('+962700000002', 'عمان', '2099-12-31', '09:00', 'pending');
--   ROLLBACK;
