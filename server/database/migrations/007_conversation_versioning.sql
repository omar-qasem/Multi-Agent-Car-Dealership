-- 007_conversation_versioning.sql
-- Optimistic-lock version counter + system_flags KV store.
--
-- version: incremented on every save. Used by saveConversationState to
-- detect concurrent writes (two messages from the same phone processed
-- simultaneously) and retry rather than silently overwriting.
--
-- system_flags: lightweight key-value table for persisting process-level
-- state across Netlify cold starts (e.g. Groq TPD exhaustion date).

ALTER TABLE conversation_states
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- ── System flags table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_flags (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE system_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_flags FORCE ROW LEVEL SECURITY;

-- service_role bypasses RLS; deny everything to anon/authenticated roles
CREATE POLICY "deny_anon_system_flags" ON system_flags
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
