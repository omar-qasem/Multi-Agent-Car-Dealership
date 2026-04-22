-- Migration 006: Failed messages dead-letter queue
-- Run this in Supabase SQL Editor.
--
-- Purpose: messages that permanently fail processing appear here for
-- manual review in the dashboard, instead of being silently lost.

CREATE TABLE IF NOT EXISTS failed_messages (
    id             BIGSERIAL PRIMARY KEY,
    message_id     TEXT,
    phone_number   TEXT NOT NULL,
    customer_message TEXT,
    error_kind     TEXT,
    error_message  TEXT,
    raw_payload    JSONB,
    retry_count    INT DEFAULT 0,
    resolved       BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_failed_messages_phone
    ON failed_messages (phone_number);

CREATE INDEX IF NOT EXISTS idx_failed_messages_resolved
    ON failed_messages (resolved, created_at DESC);

-- RLS: service role can read/write; anon cannot.
ALTER TABLE failed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_role_all"
    ON failed_messages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
