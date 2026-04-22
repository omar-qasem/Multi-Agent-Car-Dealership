/**
 * P3-11 test — executeTool must tolerate null/undefined/non-object args.
 *
 * Regression guard for prod crash 2026-04-18:
 *   [TOOL ERROR] get_branch_info (unknown): Cannot read properties of null (reading 'branch')
 *
 * Root cause: Groq sometimes emits function.arguments = "null" (literal string),
 * JSON.parse("null") returns JavaScript null, which bypasses the `|| '{}'` guard.
 *
 * Run: node tests/null-args.test.js
 */
const assert = require('node:assert');
const { executeTool } = require('../server/services/agent-tools');

// Mock DB methods that some tool cases need — get_branch_info doesn't touch DB
// but get_promotions does, and we call it below.
const db = require('../server/database/db');
db.getActivePromotions = async () => [];

(async () => {
    let passed = 0, failed = 0;
    async function t(name, fn) {
        try { await fn(); console.log(`  ✓ ${name}`); passed++; }
        catch (e) { console.error(`  ✗ ${name}\n     ${e.message}`); failed++; }
    }

    await t('get_branch_info(null) returns all branches instead of crashing', async () => {
        const r = await executeTool('get_branch_info', null, '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(Array.isArray(r.branches), 'expected branches array');
        assert.strictEqual(r.branches.length, 4);
    });

    await t('get_branch_info(undefined) returns all branches', async () => {
        const r = await executeTool('get_branch_info', undefined, '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(Array.isArray(r.branches));
    });

    await t('get_branch_info("string") returns all branches (coerced)', async () => {
        const r = await executeTool('get_branch_info', 'not an object', '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(Array.isArray(r.branches));
    });

    await t('get_branch_info([]) returns all branches (array coerced to {})', async () => {
        const r = await executeTool('get_branch_info', [], '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(Array.isArray(r.branches));
    });

    await t('get_branch_info({ branch: "عمان" }) still returns the single branch (positive)', async () => {
        const r = await executeTool('get_branch_info', { branch: 'عمان' }, '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(r.branch && r.branch.name.includes('عمان'));
    });

    await t('get_promotions(null) does not crash', async () => {
        const r = await executeTool('get_promotions', null, '962000000000');
        assert.strictEqual(r.success, true);
    });

    await t('get_service_types(null) returns services list', async () => {
        const r = await executeTool('get_service_types', null, '962000000000');
        assert.strictEqual(r.success, true);
        assert.ok(Array.isArray(r.services) && r.services.length > 0);
    });

    console.log(`\n${passed}/${passed+failed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('runner crash:', e); process.exit(1); });
