/**
 * P0-06 smoke tests for the RLS lockdown migration.
 *
 * Can't run actual SQL in this sandbox, so instead we lint the migration
 * file for the critical assertions:
 *   - RLS is ENABLEd (and FORCEd) on every sensitive table
 *   - anon/authenticated are explicitly revoked from every table
 *   - service_role is granted explicitly
 *   - deny-all RESTRICTIVE policy exists for anon on PII tables
 *
 * Run: node tests/rlsMigration.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const SQL_PATH = path.resolve(__dirname, '../server/database/migrations/002_rls_lockdown.sql');
const SQL = fs.readFileSync(SQL_PATH, 'utf8');

const PII_TABLES = [
    'customers', 'bookings', 'support_tickets',
    'purchase_inquiries', 'messages', 'conversation_states',
];
const ALL_TABLES = [
    ...PII_TABLES, 'cars', 'parts', 'promotions',
];

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('migration: revokes ALL from anon on every table', () => {
    assert.ok(/REVOKE ALL ON TABLE public\.%I FROM anon/.test(SQL),
        'should revoke ALL from anon via DO loop');
});

test('migration: revokes ALL from authenticated on every table', () => {
    assert.ok(/REVOKE ALL ON TABLE public\.%I FROM authenticated/.test(SQL),
        'should revoke ALL from authenticated via DO loop');
});

test('migration: grants service_role', () => {
    assert.ok(/GRANT\s+ALL ON TABLE public\.%I TO service_role/.test(SQL),
        'should grant ALL to service_role');
});

test('migration: revokes schema usage from anon', () => {
    assert.ok(/REVOKE USAGE ON SCHEMA public FROM anon/.test(SQL));
    assert.ok(/REVOKE USAGE ON SCHEMA public FROM authenticated/.test(SQL));
});

test('migration: ENABLE RLS on every known table', () => {
    for (const t of ALL_TABLES) {
        const re = new RegExp(`ALTER TABLE IF EXISTS ${t}\\s+ENABLE ROW LEVEL SECURITY`);
        assert.ok(re.test(SQL), `missing ENABLE RLS for ${t}`);
    }
});

test('migration: FORCE RLS on every known table (even the owner must obey)', () => {
    for (const t of ALL_TABLES) {
        const re = new RegExp(`ALTER TABLE IF EXISTS ${t}\\s+FORCE ROW LEVEL SECURITY`);
        assert.ok(re.test(SQL), `missing FORCE RLS for ${t}`);
    }
});

test('migration: anon_deny_all policy targets all PII tables', () => {
    // The policy is created in a DO loop — ensure the table list includes every PII table
    for (const t of PII_TABLES) {
        const re = new RegExp(`['"]${t}['"]`);
        assert.ok(re.test(SQL), `PII table ${t} must appear in deny-all policy loop`);
    }
    assert.ok(/AS RESTRICTIVE FOR ALL TO anon USING \(false\) WITH CHECK \(false\)/.test(SQL),
        'deny-all policy must be RESTRICTIVE with USING(false) and WITH CHECK(false)');
});

test('migration: deny-all policy drops existing before create (idempotent)', () => {
    assert.ok(/DROP POLICY IF EXISTS "anon_deny_all" ON public\.%I/.test(SQL));
});

test('migration: is fully idempotent (uses IF EXISTS / DROP IF EXISTS)', () => {
    // Every non-comment ALTER TABLE should be guarded with IF EXISTS
    const codeOnly = SQL
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');
    const alterMatches = codeOnly.match(/ALTER TABLE\s+(?!IF EXISTS)/g) || [];
    assert.strictEqual(alterMatches.length, 0,
        `all ALTER TABLE must use IF EXISTS, found: ${JSON.stringify(alterMatches)}`);
});

test('migration: does NOT grant anon SELECT on catalogue by default', () => {
    // The anon_read_catalogue block is intentionally commented out — ensure
    // no uncommented CREATE POLICY ... TO anon exists that grants reads.
    const uncommentedAnonPolicy = SQL
        .split('\n')
        .filter(l => !l.trim().startsWith('--'))
        .join('\n');
    assert.ok(!/CREATE POLICY[^;]*TO anon\s+USING\s*\(true\)/is.test(uncommentedAnonPolicy),
        'no uncommented permissive policy should grant anon read access');
});

test('migration: docstring includes verification instructions', () => {
    assert.ok(/HOW TO VERIFY/.test(SQL));
    assert.ok(/pg_policies/.test(SQL));
    assert.ok(/information_schema\.table_privileges/.test(SQL));
});

// ---------------------------------------------------------------
// Also sanity-check the main schema has RLS enabled (matching posture)
// ---------------------------------------------------------------
test('main schema: RLS is enabled on every sensitive table', () => {
    const mainSqlPath = path.resolve(__dirname, '../server/database/supabase-schema.sql');
    const MAIN = fs.readFileSync(mainSqlPath, 'utf8');
    for (const t of ALL_TABLES.filter(t => t !== 'conversation_states')) {
        const re = new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`);
        assert.ok(re.test(MAIN), `main schema missing RLS on ${t}`);
    }
});

// ---------------------------------------------------------------
// Backend uses service_role key — not anon key — so the frontend can never
// see these tables directly. Verify db.js picks the right key.
// ---------------------------------------------------------------
test('db.js uses SUPABASE_SERVICE_KEY (not anon key)', () => {
    const dbPath = path.resolve(__dirname, '../server/database/db.js');
    const DB = fs.readFileSync(dbPath, 'utf8');
    assert.ok(/SUPABASE_SERVICE_KEY/.test(DB),
        'db.js must use SUPABASE_SERVICE_KEY so it bypasses RLS properly');
    // Guard: no client ever reads SUPABASE_ANON_KEY from db.js
    assert.ok(!/SUPABASE_ANON_KEY/.test(DB),
        'db.js MUST NOT import the anon key — that would defeat RLS lockdown');
});

(async () => {
    let passed = 0, failed = 0;
    for (const t of TESTS) {
        try { await t.fn(); console.log(`  ✓ ${t.name}`); passed++; }
        catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`     ${err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
