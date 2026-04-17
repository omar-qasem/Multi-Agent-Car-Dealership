/**
 * Unit tests for server/utils/timeSlots.js
 * Run: node tests/timeSlots.test.js
 */

const assert = require('node:assert');
const {
    CANONICAL_SLOTS,
    DISPLAY_SLOTS,
    canonicalToDisplay,
    parseTime,
    toNearestSlot,
    isValidSlot,
} = require('../server/utils/timeSlots');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// --- canonicalToDisplay ---
test('canonicalToDisplay: 09:00 → "9:00 ص"', () => {
    assert.strictEqual(canonicalToDisplay('09:00'), '9:00 ص');
});
test('canonicalToDisplay: 13:00 → "1:00 م"', () => {
    assert.strictEqual(canonicalToDisplay('13:00'), '1:00 م');
});
test('canonicalToDisplay: 00:00 → "12:00 ص"', () => {
    assert.strictEqual(canonicalToDisplay('00:00'), '12:00 ص');
});
test('canonicalToDisplay: 12:00 → "12:00 م"', () => {
    assert.strictEqual(canonicalToDisplay('12:00'), '12:00 م');
});
test('canonicalToDisplay: invalid returns null', () => {
    assert.strictEqual(canonicalToDisplay('9:00'), null);
    assert.strictEqual(canonicalToDisplay(null), null);
    assert.strictEqual(canonicalToDisplay('abc'), null);
});

// --- parseTime: 24-hour form ---
test('parseTime: "09:00" → "09:00"', () => {
    assert.strictEqual(parseTime('09:00'), '09:00');
});
test('parseTime: "9:00" → "09:00" (no period → 24h)', () => {
    assert.strictEqual(parseTime('9:00'), '09:00');
});
test('parseTime: "13:30" → "13:30"', () => {
    assert.strictEqual(parseTime('13:30'), '13:30');
});

// --- parseTime: Arabic short form ---
test('parseTime: "9:00 ص" → "09:00"', () => {
    assert.strictEqual(parseTime('9:00 ص'), '09:00');
});
test('parseTime: "9:00 م" → "21:00"', () => {
    assert.strictEqual(parseTime('9:00 م'), '21:00');
});
test('parseTime: "12:00 ص" → "00:00" (midnight)', () => {
    assert.strictEqual(parseTime('12:00 ص'), '00:00');
});
test('parseTime: "12:00 م" → "12:00" (noon)', () => {
    assert.strictEqual(parseTime('12:00 م'), '12:00');
});
test('parseTime: "1:00 م" → "13:00"', () => {
    assert.strictEqual(parseTime('1:00 م'), '13:00');
});

// --- parseTime: Arabic long form ---
test('parseTime: "9:00 صباحاً" → "09:00"', () => {
    assert.strictEqual(parseTime('9:00 صباحاً'), '09:00');
});
test('parseTime: "9:00 صباحا" → "09:00"', () => {
    assert.strictEqual(parseTime('9:00 صباحا'), '09:00');
});
test('parseTime: "5:00 مساءً" → "17:00"', () => {
    assert.strictEqual(parseTime('5:00 مساءً'), '17:00');
});
test('parseTime: "3 عصرا" → "15:00"', () => {
    assert.strictEqual(parseTime('3 عصرا'), '15:00');
});

// --- parseTime: English ---
test('parseTime: "9:00 AM" → "09:00"', () => {
    assert.strictEqual(parseTime('9:00 AM'), '09:00');
});
test('parseTime: "5 pm" → "17:00"', () => {
    assert.strictEqual(parseTime('5 pm'), '17:00');
});

// --- parseTime: Arabic digits ---
test('parseTime: "٩:٠٠ ص" → "09:00"', () => {
    assert.strictEqual(parseTime('٩:٠٠ ص'), '09:00');
});

// --- parseTime: garbage ---
test('parseTime: "" → null', () => {
    assert.strictEqual(parseTime(''), null);
});
test('parseTime: "bogus" → null', () => {
    assert.strictEqual(parseTime('bogus'), null);
});
test('parseTime: null → null', () => {
    assert.strictEqual(parseTime(null), null);
});
test('parseTime: "25:00" (invalid hour) → null', () => {
    assert.strictEqual(parseTime('25:00'), null);
});

// --- isValidSlot ---
test('isValidSlot: "09:00" is valid', () => {
    assert.strictEqual(isValidSlot('09:00'), true);
});
test('isValidSlot: "09:30" is not valid', () => {
    assert.strictEqual(isValidSlot('09:30'), false);
});
test('isValidSlot: "20:00" is not valid (after hours)', () => {
    assert.strictEqual(isValidSlot('20:00'), false);
});

// --- toNearestSlot ---
test('toNearestSlot: "09:30" → "09:00"', () => {
    assert.strictEqual(toNearestSlot('09:30'), '09:00');
});
test('toNearestSlot: "22:00" → null (outside hours)', () => {
    assert.strictEqual(toNearestSlot('22:00'), null);
});

// --- End-to-end contract: LLM passes Arabic, we store canonical ---
test('end-to-end: "9:00 ص" parses to valid slot', () => {
    const canon = parseTime('9:00 ص');
    assert.strictEqual(canon, '09:00');
    assert.strictEqual(isValidSlot(canon), true);
});
test('end-to-end: "9:00 صباحاً" (old default) now parses cleanly', () => {
    const canon = parseTime('9:00 صباحاً');
    assert.strictEqual(canon, '09:00');
    assert.strictEqual(isValidSlot(canon), true);
});
test('end-to-end: "9:00 صباحاً" round-trips to display slot', () => {
    const canon = parseTime('9:00 صباحاً');
    assert.strictEqual(canonicalToDisplay(canon), '9:00 ص');
    assert.ok(DISPLAY_SLOTS.includes('9:00 ص'));
});
test('CANONICAL_SLOTS length is 12 (08:00..19:00)', () => {
    assert.strictEqual(CANONICAL_SLOTS.length, 12);
    assert.strictEqual(CANONICAL_SLOTS[0], '08:00');
    assert.strictEqual(CANONICAL_SLOTS[11], '19:00');
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
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
