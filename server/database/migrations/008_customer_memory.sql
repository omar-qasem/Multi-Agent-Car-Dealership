-- Migration 008: Customer persistent memory
-- Adds car profile + preferences to customers table so the AI
-- remembers the customer's car across ALL conversations (not just one session).
--
-- Run in Supabase SQL Editor.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS car_make        TEXT,
  ADD COLUMN IF NOT EXISTS car_model       TEXT,
  ADD COLUMN IF NOT EXISTS car_year        INT,
  ADD COLUMN IF NOT EXISTS preferred_branch TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes  TEXT;

-- Index for branch-based queries in analytics
CREATE INDEX IF NOT EXISTS idx_customers_branch
  ON customers (preferred_branch)
  WHERE preferred_branch IS NOT NULL;
