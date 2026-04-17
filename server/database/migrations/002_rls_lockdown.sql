-- ================================================================
-- Migration 002 — Row-Level Security Lockdown (P0-06)
-- ================================================================
-- The main schema already runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
-- on every table, so by default no rows are readable with the anon key
-- (RLS-enabled + zero policies = no rows). That's correct, but it's one
-- mistaken `CREATE POLICY ... TO anon` away from a full database leak.
--
-- This migration adds belt-and-suspenders defenses:
--   1. Revoke all grants from `anon` and `authenticated` on every public
--      table (RLS + no grants = no access, even with the anon key).
--   2. Revoke schema USAGE from `anon` so schema introspection is blocked.
--   3. Re-enable RLS (idempotent — safe to re-run).
--   4. Explicit DENY policies for anon on each sensitive table so any
--      future accidental policy widening still has to override DENY first.
--   5. Grant full access only to `service_role` (which bypasses RLS
--      implicitly, but we GRANT explicitly to make the intent auditable).
--   6. Conversation states table (added by migration 001) gets the same
--      lockdown.
--
-- Run this ONCE in Supabase SQL Editor after migration 001.
-- Safe to re-run — every statement is idempotent.
--
-- HOW TO VERIFY after running:
--   Using the anon key, try:
--     SELECT * FROM bookings;
--     SELECT * FROM customers;
--   You should get 0 rows or a permission error. If you see data, STOP
--   and re-check which key is configured — your SUPABASE_ANON_KEY may
--   be a service_role key by mistake.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Revoke blanket grants on every public table from non-service roles
-- ----------------------------------------------------------------
-- Postgres grants SELECT/INSERT/UPDATE/DELETE to PUBLIC by default when a
-- table is created in some Supabase templates. Strip them.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t.tablename);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.tablename);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t.tablename);
        EXECUTE format('GRANT  ALL ON TABLE public.%I TO service_role',   t.tablename);
    END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 2. Revoke schema USAGE from anon (blocks introspection)
-- ----------------------------------------------------------------
REVOKE USAGE ON SCHEMA public FROM anon;
REVOKE USAGE ON SCHEMA public FROM authenticated;
GRANT  USAGE ON SCHEMA public TO service_role;

-- ----------------------------------------------------------------
-- 3. Re-assert RLS on every known table (idempotent)
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS cars                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS parts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_inquiries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS promotions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversation_states  ENABLE ROW LEVEL SECURITY;

-- Also FORCE RLS so even the table owner is subject to it (except for
-- explicit BYPASSRLS roles, which service_role has).
ALTER TABLE IF EXISTS cars                 FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS parts                FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers            FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings             FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets      FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_inquiries   FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages             FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS promotions           FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversation_states  FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 4. Explicit DENY policies for anon on sensitive tables
-- ----------------------------------------------------------------
-- Order matters for documentation: `RESTRICTIVE` policies stack with AND,
-- so a deny-all RESTRICTIVE policy on anon means any future permissive
-- policy someone adds must clear this gate too. In postgres every row
-- must satisfy ALL restrictive policies in addition to at least one
-- permissive policy — and with zero permissive policies for anon on
-- customer-PII tables, nothing is ever visible.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'customers','bookings','support_tickets','purchase_inquiries',
        'messages','conversation_states'
    ]) LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
            EXECUTE format('DROP POLICY IF EXISTS "anon_deny_all" ON public.%I', t);
            EXECUTE format(
                'CREATE POLICY "anon_deny_all" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',
                t
            );
        END IF;
    END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 5. Public catalogue (cars, parts, promotions) — allow anon SELECT only.
-- ----------------------------------------------------------------
-- These are product-catalogue tables that are safe to expose read-only.
-- If the frontend ever wants to query them with the anon key, these
-- policies let it. Writes remain service-role-only.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['cars','parts','promotions']) LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
            EXECUTE format('DROP POLICY IF EXISTS "anon_read_catalogue" ON public.%I', t);
            -- Currently NOT granting anon SELECT by default — uncomment the
            -- following block and re-run if the public site later needs it.
            -- EXECUTE format(
            --     'CREATE POLICY "anon_read_catalogue" ON public.%I FOR SELECT TO anon USING (true)',
            --     t
            -- );
        END IF;
    END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 6. Verification helpers — run these to audit after deploy
-- ----------------------------------------------------------------
-- Show every public table and its RLS state:
--   SELECT tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- Show every policy:
--   SELECT schemaname, tablename, policyname, permissive, roles, cmd
--   FROM pg_policies WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Show grants (should show service_role and NOTHING for anon on PII):
--   SELECT grantee, privilege_type, table_name
--   FROM information_schema.table_privileges
--   WHERE table_schema = 'public'
--   ORDER BY table_name, grantee;
