/**
 * Integration tests for book_maintenance and check_branch_availability
 * Run: node tests/bookMaintenance.test.js
 *
 * Stubs the database module via require.cache so we don't need Supabase.
 */

const path = require('node:path');
const assert = require('node:assert');

// Always a future date so book_maintenance's past-date guard never rejects
// these fixtures regardless of when the suite runs.
function futureDateStr(daysAhead = 30) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString().split('T')[0];
}


// ---------------------------------------------------------------
// Stub the database module BEFORE requiring agent-tools.
// ---------------------------------------------------------------
const DB_PATH = path.resolve(__dirname, '../server/database/db.js');
const fakeDb = {
    _bookings: [],
    _nextBookingId: 1,
    _customers: [],
    async getBookingsByBranchAndDate(branch, date) {
        return this._bookings.filter(b => b.branch === branch && b.preferred_date === date);
    },
    async createBooking(row) {
        const booking = { id: `BK-${this._nextBookingId++}`, ...row, created_at: new Date().toISOString() };
        this._bookings.push(booking);
        return booking;
    },
    async upsertCustomer(phone, patch) {
        const existing = this._customers.find(c => c.phone === phone);
        if (existing) Object.assign(existing, patch);
        else this._customers.push({ phone, ...patch });
    },
    _reset() {
        this._bookings = [];
        this._customers = [];
        this._nextBookingId = 1;
    },
};
require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: fakeDb,
};

// Load the tool module (picks up our stub).
const { executeTool } = require('../server/services/agent-tools');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// ---------------------------------------------------------------
// book_maintenance tests
// ---------------------------------------------------------------
test('book_maintenance: missing preferred_time → needs_more_info', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        branch: 'عمان',
        // preferred_time intentionally missing
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.needs_more_info, true);
    assert.ok(result.missing_fields.some(f => f.includes('الوقت')), `expected missing field to mention وقت, got: ${JSON.stringify(result.missing_fields)}`);
    assert.strictEqual(fakeDb._bookings.length, 0, 'no booking should be created');
});

test('book_maintenance: unparseable preferred_time → needs_more_info (no default)', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        preferred_time: 'غير واضح',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.needs_more_info, true);
    assert.ok(Array.isArray(result.available_slots));
    assert.strictEqual(fakeDb._bookings.length, 0);
});

test('book_maintenance: valid Arabic short time "9:00 ص" → canonical "09:00"', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, true);
    assert.strictEqual(fakeDb._bookings.length, 1);
    assert.strictEqual(fakeDb._bookings[0].preferred_time, '09:00', 'stored time should be canonical 09:00');
    assert.strictEqual(result.details.time, '9:00 ص');
    assert.strictEqual(result.details.time_canonical, '09:00');
});

test('book_maintenance: valid Arabic long "9:00 صباحاً" now maps to 09:00', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        preferred_time: '9:00 صباحاً',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, true);
    assert.strictEqual(fakeDb._bookings[0].preferred_time, '09:00');
});

test('book_maintenance: "5:00 م" (PM) → canonical "17:00"', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        preferred_time: '5:00 م',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, true);
    assert.strictEqual(fakeDb._bookings[0].preferred_time, '17:00');
});

test('book_maintenance: off-hours time (20:00) → rejected', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: futureDateStr(),
        preferred_time: '20:00',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.needs_more_info, true);
    assert.strictEqual(fakeDb._bookings.length, 0);
});

test('book_maintenance: invalid date format → rejected', async () => {
    fakeDb._reset();
    const result = await executeTool('book_maintenance', {
        car_make: 'Toyota',
        car_model: 'Camry',
        service_type: 'تغيير زيت',
        preferred_date: 'بكرا',
        preferred_time: '9:00 ص',
        branch: 'عمان',
    }, '+962791234567');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.needs_more_info, true);
    assert.ok(result.missing_fields.some(f => f.includes('YYYY-MM-DD')));
});

// ---------------------------------------------------------------
// check_branch_availability tests
// ---------------------------------------------------------------
test('check_branch_availability: returns display-form slots', async () => {
    fakeDb._reset();
    const result = await executeTool('check_branch_availability', {
        branch: 'عمان',
        date: futureDateStr(),
    }, '+962791234567');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.is_available, true);
    assert.ok(Array.isArray(result.available_time_slots));
    assert.ok(result.available_time_slots.includes('9:00 ص'));
    assert.ok(Array.isArray(result.available_slots_canonical));
    assert.ok(result.available_slots_canonical.includes('09:00'));
});

test('check_branch_availability: legacy Arabic-long bookings are filtered correctly', async () => {
    // Seed a legacy booking with the OLD bad format — it should still be
    // recognized as occupying the 09:00 slot.
    fakeDb._reset();
    fakeDb._bookings.push({
        id: 'BK-LEGACY',
        branch: 'عمان',
        preferred_date: futureDateStr(),
        preferred_time: '9:00 صباحاً', // old default
    });
    const result = await executeTool('check_branch_availability', {
        branch: 'عمان',
        date: futureDateStr(),
    }, '+962791234567');
    assert.ok(!result.available_slots_canonical.includes('09:00'),
        '09:00 should be taken by the legacy booking');
    assert.ok(!result.available_time_slots.includes('9:00 ص'),
        'the Arabic display form for 09:00 should not be listed');
});

test('check_branch_availability: canonical bookings (new format) also filtered', async () => {
    fakeDb._reset();
    fakeDb._bookings.push({
        id: 'BK-NEW',
        branch: 'عمان',
        preferred_date: futureDateStr(),
        preferred_time: '09:00', // new canonical
    });
    const result = await executeTool('check_branch_availability', {
        branch: 'عمان',
        date: futureDateStr(),
    }, '+962791234567');
    assert.ok(!result.available_slots_canonical.includes('09:00'));
});

// ---------------------------------------------------------------
// Smoke test: TOOL_DEFINITIONS schema includes preferred_time in required
// ---------------------------------------------------------------
test('book_maintenance tool schema: preferred_time is required', () => {
    const { TOOL_DEFINITIONS } = require('../server/services/agent-tools');
    const def = TOOL_DEFINITIONS.find(t => t.function && t.function.name === 'book_maintenance');
    assert.ok(def, 'book_maintenance tool definition must exist');
    assert.ok(def.function.parameters.required.includes('preferred_time'),
        `preferred_time must be in required[], got: ${def.function.parameters.required.join(',')}`);
});

test('book_maintenance tool schema: preferred_time has enum of valid slots', () => {
    const { TOOL_DEFINITIONS } = require('../server/services/agent-tools');
    const def = TOOL_DEFINITIONS.find(t => t.function && t.function.name === 'book_maintenance');
    const timeSchema = def.function.parameters.properties.preferred_time;
    assert.ok(Array.isArray(timeSchema.enum));
    assert.ok(timeSchema.enum.includes('9:00 ص'));
    assert.ok(timeSchema.enum.includes('09:00'));
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
