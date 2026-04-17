/**
 * P0-03 regression tests: write tools must return a graceful-fail shape
 * when the database is down. Never pretend success.
 *
 * Run: node tests/writeOutage.test.js
 */

const path = require('node:path');
const assert = require('node:assert');

// Stub the db module via require.cache BEFORE loading agent-tools.
const DB_PATH = path.resolve(__dirname, '../server/database/db.js');

function makeFailingDb(failMode = 'database') {
    const err = () => {
        const e = new Error(
            failMode === 'transient'
                ? 'fetch failed: ETIMEDOUT'
                : '[DB] Supabase createBooking failed: PGRST301 JWT expired'
        );
        if (failMode === 'database') e.code = 'PGRST301';
        throw e;
    };
    return {
        async upsertCustomer()             { err(); },
        async createBooking()              { err(); },
        async createTicket()               { err(); },
        async createInquiry()              { err(); },
        async getBookingsByBranchAndDate() { return []; },
        async searchCars()                 { return []; },
        async searchParts()                { return []; },
    };
}

function loadToolsWithDb(db) {
    require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: db };
    // Force reload of agent-tools so it picks up the fresh stub
    const AT_PATH = path.resolve(__dirname, '../server/services/agent-tools.js');
    delete require.cache[AT_PATH];
    return require('../server/services/agent-tools');
}

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// ---------------------------------------------------------------
// book_maintenance — DB error → graceful fail
// ---------------------------------------------------------------
test('book_maintenance: DB down → success=false, write_persisted=false', async () => {
    const { executeTool } = loadToolsWithDb(makeFailingDb('database'));
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota', car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: '2026-05-01', preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, false,
        'must NOT report success when DB fails');
    assert.strictEqual(result.write_persisted, false,
        'must explicitly flag write_persisted=false');
    assert.strictEqual(result.error_category, 'database');
    assert.strictEqual(result.retry_advised, false,
        'database (non-transient) errors should not advise auto-retry');
    assert.ok(result.failure_ref && result.failure_ref.startsWith('FAIL-'));
    assert.strictEqual(result.customer_phone, '+962791234567');
    assert.ok(typeof result.message === 'string' && result.message.length > 10);
});

test('book_maintenance: transient network error → retry_advised=true', async () => {
    const { executeTool } = loadToolsWithDb(makeFailingDb('transient'));
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota', car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: '2026-05-01', preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.write_persisted, false);
    assert.strictEqual(result.error_category, 'transient');
    assert.strictEqual(result.retry_advised, true);
});

// ---------------------------------------------------------------
// submit_support_ticket — DB error → graceful fail
// ---------------------------------------------------------------
test('submit_support_ticket: DB down → graceful fail', async () => {
    const { executeTool } = loadToolsWithDb(makeFailingDb('database'));
    const result = await executeTool('submit_support_ticket', {
        issue_description: 'مشكلة في المكيف',
        category: 'service',
        priority: 'high',
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.write_persisted, false);
    assert.ok(result.failure_ref);
});

// ---------------------------------------------------------------
// create_purchase_inquiry — DB error → graceful fail
// ---------------------------------------------------------------
test('create_purchase_inquiry: DB down → graceful fail', async () => {
    const { executeTool } = loadToolsWithDb(makeFailingDb('database'));
    const result = await executeTool('create_purchase_inquiry', {
        car_make: 'Toyota', car_model: 'Camry',
        budget: 20000,
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.write_persisted, false);
    assert.ok(result.failure_ref);
});

// ---------------------------------------------------------------
// Read tools should still fail gracefully but without the write flag
// ---------------------------------------------------------------
test('read tool (search_cars): DB down → success=false, no write flag', async () => {
    const failingDb = makeFailingDb('database');
    failingDb.searchCars = async () => { throw new Error('[DB] Supabase searchCars failed: connection refused'); };
    const { executeTool } = loadToolsWithDb(failingDb);
    const result = await executeTool('search_cars', { make: 'Toyota' }, '+962791234567');
    assert.strictEqual(result.success, false);
    // Read tools should NOT have the write_persisted flag — that's a write-tool signal
    assert.strictEqual(result.write_persisted, undefined);
    assert.strictEqual(result.error_category, 'database');
});

// ---------------------------------------------------------------
// classifyError direct unit checks
// ---------------------------------------------------------------
test('classifyError: fetch failed → transient', () => {
    const { classifyError } = loadToolsWithDb(makeFailingDb('database'));
    assert.strictEqual(classifyError(new Error('fetch failed')), 'transient');
});
test('classifyError: ETIMEDOUT → transient', () => {
    const { classifyError } = loadToolsWithDb(makeFailingDb('database'));
    assert.strictEqual(classifyError(new Error('request ETIMEDOUT')), 'transient');
});
test('classifyError: Supabase error → database', () => {
    const { classifyError } = loadToolsWithDb(makeFailingDb('database'));
    assert.strictEqual(classifyError(new Error('[DB] Supabase createBooking failed')), 'database');
});
test('classifyError: random error → unknown', () => {
    const { classifyError } = loadToolsWithDb(makeFailingDb('database'));
    assert.strictEqual(classifyError(new Error('some validation')), 'unknown');
});

// ---------------------------------------------------------------
// WRITE_TOOLS set is exported and complete
// ---------------------------------------------------------------
test('WRITE_TOOLS contains all three write tools', () => {
    const { WRITE_TOOLS } = loadToolsWithDb(makeFailingDb('database'));
    assert.ok(WRITE_TOOLS.has('book_maintenance'));
    assert.ok(WRITE_TOOLS.has('submit_support_ticket'));
    assert.ok(WRITE_TOOLS.has('create_purchase_inquiry'));
});

(async () => {
    let passed = 0, failed = 0;
    for (const t of TESTS) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`     ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(1, 3).join('\n'));
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
