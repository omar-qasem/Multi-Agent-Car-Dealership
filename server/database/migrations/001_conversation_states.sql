-- ================================================================
-- Migration 001 — Conversation States Table
-- ================================================================
-- Persists conversation history across Netlify cold starts so users
-- can have multi-turn conversations (e.g. collecting booking info
-- across 3-4 messages) without losing context.
--
-- Run this ONCE in Supabase SQL Editor after the main schema.
-- Safe to re-run: uses IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS conversation_states (
  phone_number       TEXT PRIMARY KEY,
  history            JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_intent     TEXT,                              -- 'booking' | 'purchase' | 'support' | NULL
  collected_entities JSONB NOT NULL DEFAULT '{}'::jsonb, -- accumulated slots: {service_type, car_make, ...}
  turn_count         INTEGER NOT NULL DEFAULT 0,
  last_active        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_convstate_last_active ON conversation_states(last_active DESC);

ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS automatically; no policies needed for backend-only access.

-- ================================================================
-- DONE — verify with:
--   SELECT * FROM conversation_states LIMIT 1;
-- ================================================================
