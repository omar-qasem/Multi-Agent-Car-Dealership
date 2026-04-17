/**
 * P1-01 tests — Double-booking slot collision prevention
 *
 * Can't run real Postgres in this sandbox, so we verify:
 *   1. The migration SQL has the partial unique index on the right columns.
 *   2. db.createBooking's in-memory path rejects a second insert for the
 *      same (branch, preferred_date, preferred_time) with a structured
 *      { slot_taken: true } response.
 *   3. Postgres 23505 errors from Supabase are translated to slot_taken,
 *      not thrown up the stack.
 *   4. agent-tools book_maintenance surfaces slot_taken to the LLM with
 *      explicit `write_persisted: false` and a re-prompt suggestion.
 *   5. A cancelled booking on the same slot does NOT trigger a collision —
 *      customers can rebook a cancelled slot.
 *
 * Run: node tests/slotCollision.test.js
 */

const fs  = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function loadFresh(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

// ============================================================
// 1. Migration SQL lint
// ============================================================
test('migration 003: creates partial unique index on bookings slot', () => {
    const sqlPath = path.resolve(__dirname, '../server/database/migrations/003_booking_slot_unique.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_unique/.test(sql),
        'migration must create idx_bookings_slot_unique');
    assert.ok(/ON bookings \(branch, preferred_date, preferred_time\)/.test(sql),
        'index must cover (branch, preferred_date, preferred_time)');
    assert.ok(/WHERE status IN \('pending', 'confirmed'\)/.test(sql),
        'index must be partial — only pending/confirmed rows collide');
    assert.ok(/preferred_date IS NOT NULL/.test(sql)
           && /preferred_time IS NOT NULL/.test(sql)
           && /branch\s+IS NOT NULL/.test(sql),
        'partial predicate must also guard against NULL components');
});

// ============================================================
// 2. In-memory createBooking collision
// ============================================================
test('in-memory: second booking on same slot returns slot_taken', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    const db = loadFresh('../server/database/db');
    await db.initDatabase();

    const base = {
        customer_phone: '+962700000111',
        customer_name:  'First',
        car_make: 'Toyota', car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: '2099-12-31',
        preferred_time: '09:00',
        branch: 'عمان',
    };

    const first = await db.createBooking(base);
    assert.ok(first?.id, 'first booking must succeed');
    assert.ok(!first.slot_taken, 'first booking must not report collision');

    const second = await db.createBooking({ ...base, customer_phone: '+962700000222' });
    assert.strictEqual(second.slot_taken, true, 'second booking on same slot must return slot_taken:true');
    assert.deepStrictEqual(second.conflict, {
        branch: 'عمان',
        preferred_date: '2099-12-31',
        preferred_time: '09:00',
    });
});

test('in-memory: cancelled booking does NOT reserve the slot', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    const db = loadFresh('../server/database/db');
    await db.initDatabase();

    const slot = {
        customer_phone: '+962700000333',
        customer_name:  'Cancels',
        car_make: 'Kia', car_model: 'Cerato',
        service_type: 'فحص',
        preferred_date: '2099-11-30',
        preferred_time: '10:00',
        branch: 'إربد',
    };

    const b1 = await db.createBooking(slot);
    assert.ok(b1.id, 'initial booking must succeed');

    // Simulate cancellation (in-memory status flip)
    await db.updateBookingStatus(b1.id, 'cancelled');

    const b2 = await db.createBooking({ ...slot, customer_phone: '+962700000444' });
    assert.ok(!b2.slot_taken, 'second booking should succeed when previous was cancelled');
    assert.ok(b2.id, 'cancelled slot must be re-bookable');
});

// ============================================================
// 3. Supabase 23505 translation
// ============================================================
test('supabase: 23505 unique_violation returns slot_taken instead of throwing', async () => {
    // Stub @supabase/supabase-js before requiring db.js
    const supabasePath = require.resolve('@supabase/supabase-js');
    require.cache[supabasePath] = {
        id: supabasePath,
        filename: supabasePath,
        loaded: true,
        exports: {
            createClient: () => ({
                from: (_table) => ({
                    select: () => ({
                        limit:  async () => ({ data: [], error: null }),
                        eq:     () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                    insert: () => ({
                        select: () => ({
                            single: async () => ({
                                data: null,
                                error: {
                                    code: '23505',
                                    message: 'duplicate key value violates unique constraint "idx_bookings_slot_unique"',
                                },
                            }),
                        }),
                    }),
                }),
            }),
        },
    };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'stub-service-key';
    const db = loadFresh('../server/database/db');

    const result = await db.createBooking({
        customer_phone: '+962711111111',
        customer_name:  'Contest',
        car_make: 'Hyundai', car_model: 'Tucson',
        service_type: 'صيانة دورية',
        preferred_date: '2099-10-15',
        preferred_time: '11:00',
        branch: 'الزرقاء',
    });
    assert.strictEqual(result.slot_taken, true);
    assert.strictEqual(result.conflict.branch, 'الزرقاء');
    assert.strictEqual(result.conflict.preferred_time, '11:00');

    // Clean stubs
    delete require.cache[supabasePath];
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
});

test('supabase: non-23505 errors still throw (outage, not collision)', async () => {
    const supabasePath = require.resolve('@supabase/supabase-js');
    require.cache[supabasePath] = {
        id: supabasePath, filename: supabasePath, loaded: true,
        exports: {
            createClient: () => ({
                from: () => ({
                    select: () => ({
                        limit:  async () => ({ data: [], error: null }),
                        eq:     () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                    insert: () => ({
                        select: () => ({
                            single: async () => ({
                                data: null,
                                error: { code: '57014', message: 'statement_timeout' },
                            }),
                        }),
                    }),
                }),
            }),
        },
    };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'stub-service-key';
    const db = loadFresh('../server/database/db');

    await assert.rejects(
        () => db.createBooking({
            customer_phone: '+962711111111',
            preferred_date: '2099-09-15',
            preferred_time: '12:00',
            branch: 'عمان',
        }),
        /Supabase createBooking failed/
    );

    delete require.cache[supabasePath];
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
});

// ============================================================
// 4. agent-tools book_maintenance surfaces slot_taken
// ============================================================
test('agent-tools: book_maintenance translates slot_taken to LLM-friendly shape', async () => {
    // Stub db via require.cache
    const dbPath = require.resolve('../server/database/db');
    let createBookingCalls = 0;
    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: {
            upsertCustomer: async () => ({ id: 'cust-1', phone: '+962700000555' }),
            createBooking:  async () => {
                createBookingCalls++;
                return {
                    slot_taken: true,
                    conflict: { branch: 'عمان', preferred_date: '2099-12-31', preferred_time: '09:00' },
                };
            },
        },
    };

    const { executeTool } = loadFresh('../server/services/agent-tools');

    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: '2099-12-31',
        preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962700000555');

    assert.strictEqual(createBookingCalls, 1, 'createBooking should have been called');
    assert.strictEqual(result.success, false, 'slot_taken must be surfaced as failure');
    assert.strictEqual(result.write_persisted, false, 'LLM must know nothing was saved');
    assert.strictEqual(result.slot_taken, true);
    assert.ok(result.message && /تم حجز الوقت/.test(result.message),
        'message should tell the LLM the slot was just taken');
    assert.ok(/check_branch_availability/.test(result.suggestion || ''),
        'suggestion should tell the LLM to re-check availability');

    delete require.cache[dbPath];
});

test('agent-tools: successful booking still returns success:true unchanged', async () => {
    const dbPath = require.resolve('../server/database/db');
    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: {
            upsertCustomer: async () => ({ id: 'cust-2' }),
            createBooking:  async () => ({
                id: 'BK-42',
                service_type: 'تغيير زيت',
                preferred_date: '2099-12-31',
                branch: 'عمان',
                car_make: 'Toyota', car_model: 'Camry',
            }),
        },
    };

    const { executeTool } = loadFresh('../server/services/agent-tools');
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota', car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: '2099-12-31',
        preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962700000556');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.booking_id, 'BK-42');
    assert.ok(!result.slot_taken, 'successful booking must not set slot_taken');

    delete require.cache[dbPath];
});

// ============================================================
// Runner
// ============================================================
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
