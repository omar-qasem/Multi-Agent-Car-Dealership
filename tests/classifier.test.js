/**
 * P3-01 tests — Fast intent classifier
 *
 * Targets known misclassification patterns surfaced during QA:
 *
 *  1. Compound greeting: "مرحبا شو رقم تلفونكم" must NOT be hijacked by the
 *     greeting canned response when a FAQ pattern is also present.
 *  2. Compound FAQ: "شو ساعات دوامكم وبدي احجز صيانة" must NOT return the
 *     hours canned response when a strong booking keyword is also present.
 *  3. ASCII make boundary: short codes (mg, kia, bmw, chery) must not match
 *     inside unrelated English words ("image", "coming", "tokia", "cherry").
 *  4. Service-keyword verb collision: "فحصت السيارة" (I checked the car)
 *     must NOT set service_type=فحص شامل. Only standalone noun usage should.
 *  5. Fuel vs. service overlap: "بدي سيارة كهربائية" must set fuel_type but
 *     MUST NOT set service_type=كهرباء.
 *  6. Negation lookback: "والله ما كنت بدي احجز" must NOT fire booking intent
 *     even though the negation particle is more than 12 chars before the verb.
 *
 * Plus positive sanity coverage so the fixes don't over-correct.
 *
 * Run: node tests/classifier.test.js
 */

const assert = require('node:assert');
const { classify, extractCarMake, extractServiceType, extractFuelType } =
    require('../server/services/classifier');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// =============================================================
// 1. Compound greeting must not hijack FAQ
// =============================================================
test('greeting + FAQ: "مرحبا شو رقم تلفونكم" does not return greeting canned', () => {
    const r = classify('مرحبا شو رقم تلفونكم');
    assert.notStrictEqual(r.intent, 'greeting',
        `expected non-greeting, got intent=${r.intent}`);
    // Ideal: faq_phone with its canned response. At minimum: not greeting.
    if (r.cannedResponse) {
        assert.ok(/تلفون|06-/.test(r.cannedResponse),
            'canned response should be the phone FAQ, not the greeting menu');
    }
});

test('greeting + FAQ hours: "هلا شو ساعات دوامكم" returns hours FAQ', () => {
    const r = classify('هلا شو ساعات دوامكم');
    assert.strictEqual(r.intent, 'faq_hours');
    assert.ok(r.cannedResponse && /ساعات دوامنا/.test(r.cannedResponse));
});

// =============================================================
// 2. Compound FAQ + strong intent: booking wins, no canned
// =============================================================
test('FAQ hours + booking: compound query must not short-circuit on hours', () => {
    const r = classify('شو ساعات دوامكم وبدي احجز صيانة');
    assert.notStrictEqual(r.intent, 'faq_hours',
        `expected booking (or at least non-FAQ), got intent=${r.intent}`);
    assert.strictEqual(r.cannedResponse, null,
        'compound queries with strong intent must defer to the LLM');
});

test('FAQ phone + purchase: "رقمكم؟ بدي اشتري سيارة جديدة" defers to LLM', () => {
    const r = classify('رقمكم؟ بدي اشتري سيارة جديدة');
    assert.notStrictEqual(r.intent, 'faq_phone');
    assert.strictEqual(r.cannedResponse, null);
});

// =============================================================
// 3. ASCII car-make boundary
// =============================================================
test('"image your next upgrade" does not match car_make=MG', () => {
    assert.strictEqual(extractCarMake('image your next upgrade'), null);
});

test('"coming soon to our showroom" does not match car_make=MG', () => {
    assert.strictEqual(extractCarMake('coming soon to our showroom'), null);
});

test('"among the best cars" does not match car_make=MG', () => {
    assert.strictEqual(extractCarMake('among the best cars'), null);
});

test('"MG ZS please" still matches car_make=MG (positive)', () => {
    assert.strictEqual(extractCarMake('MG ZS please'), 'MG');
});

test('"I want a kia sportage" matches car_make=Kia (positive)', () => {
    assert.strictEqual(extractCarMake('I want a kia sportage'), 'Kia');
});

test('"tokia" (substring) does not match car_make=Kia', () => {
    assert.strictEqual(extractCarMake('tokia'), null);
});

// =============================================================
// 4. Service-keyword verb collision (فحصت vs فحص)
// =============================================================
test('"فحصت السيارة أمس" does not set service_type=فحص شامل', () => {
    assert.strictEqual(extractServiceType('فحصت السيارة أمس'), null);
});

test('"بدي فحص شامل" sets service_type=فحص شامل (positive)', () => {
    assert.strictEqual(extractServiceType('بدي فحص شامل'), 'فحص شامل');
});

test('"برمجت الريموت" does not set service_type=برمجة', () => {
    assert.strictEqual(extractServiceType('برمجت الريموت'), null);
});

test('"محتاج برمجة للريموت" sets service_type=برمجة (positive)', () => {
    assert.strictEqual(extractServiceType('محتاج برمجة للريموت'), 'برمجة');
});

// =============================================================
// 5. Fuel vs service overlap (كهربائية)
// =============================================================
test('"بدي سيارة كهربائية" sets fuel_type=كهربائي, not service_type=كهرباء', () => {
    const msg = 'بدي سيارة كهربائية';
    assert.strictEqual(extractFuelType(msg), 'كهربائي',
        'fuel extractor should pick this up');
    assert.strictEqual(extractServiceType(msg), null,
        'service extractor must NOT also tag كهرباء');
});

test('"عندي مشكلة بالكهرباء" still sets service_type=كهرباء (positive)', () => {
    // Here كهرباء is used in the electrical-service sense, not fuel.
    assert.strictEqual(extractServiceType('عندي مشكلة بالكهرباء'), 'كهرباء');
});

// =============================================================
// 6. Negation lookback beyond 12 chars
// =============================================================
test('"والله ما كنت بدي احجز" does not fire booking intent', () => {
    const r = classify('والله ما كنت بدي احجز');
    assert.notStrictEqual(r.intent, 'booking',
        `expected non-booking (negated), got ${r.intent}`);
});

test('"ما بدي احجز صيانة" does not fire booking intent (immediate negation, positive)', () => {
    const r = classify('ما بدي احجز صيانة');
    assert.notStrictEqual(r.intent, 'booking');
});

test('"بدي احجز صيانة بكرا" DOES fire booking intent (non-negated, positive)', () => {
    const r = classify('بدي احجز صيانة بكرا');
    assert.strictEqual(r.intent, 'booking');
});

// =============================================================
// 7. Sanity regressions (existing behavior must not break)
// =============================================================
test('plain greeting: "هلا" → greeting canned', () => {
    const r = classify('هلا');
    assert.strictEqual(r.intent, 'greeting');
    assert.ok(r.cannedResponse && r.cannedResponse.includes('أوتو جوردن'));
});

test('plain hours FAQ: "شو ساعات دوامكم" → faq_hours canned', () => {
    const r = classify('شو ساعات دوامكم');
    assert.strictEqual(r.intent, 'faq_hours');
    assert.ok(r.cannedResponse && /ساعات دوامنا/.test(r.cannedResponse));
});

test('price query: "كم سعر كامري" → price intent with car_model=كامري', () => {
    const r = classify('كم سعر كامري');
    assert.strictEqual(r.intent, 'price');
    assert.strictEqual(r.entities.car_model, 'كامري');
});

test('booking with entities: "بدي احجز صيانة لتويوتا بكرا" → booking + make + date', () => {
    const r = classify('بدي احجز صيانة لتويوتا بكرا');
    assert.strictEqual(r.intent, 'booking');
    assert.strictEqual(r.entities.car_make, 'Toyota');
    assert.strictEqual(r.entities.date, 'بكرا');
    assert.strictEqual(r.entities.service_type, 'صيانة دورية');
});

test('inferred booking: "تغيير زيت بكرا" → booking (service + date)', () => {
    const r = classify('تغيير زيت بكرا');
    assert.strictEqual(r.intent, 'booking');
    assert.strictEqual(r.entities.service_type, 'تغيير زيت');
    assert.strictEqual(r.entities.date, 'بكرا');
});

test('budget extraction: "ميزانيتي 15000 دينار" → budget=15000', () => {
    const r = classify('ميزانيتي 15000 دينار');
    assert.strictEqual(r.entities.budget, 15000);
});

test('branch extraction: "وين فرعكم بعمان" → branch=عمان', () => {
    const r = classify('وين فرعكم بعمان');
    assert.strictEqual(r.entities.branch, 'عمان');
});

// =============================================================
// 8. Production-observed spelling variants
//    (Originated from Netlify log 2026-04-18: "بدي اشتري سيارة ...
//    يعني حاطط ببالي تيوتا" — classifier missed car_make=Toyota,
//    which fed into a 20s LLM timeout.)
// =============================================================
test('"تيوتا" (single و) maps to Toyota', () => {
    assert.strictEqual(extractCarMake('حاطط ببالي تيوتا'), 'Toyota');
});

test('"طويوطا" (ط variant) maps to Toyota', () => {
    assert.strictEqual(extractCarMake('بدي طويوطا كورولا'), 'Toyota');
});

test('"هيوندا" (missing ي) maps to Hyundai', () => {
    assert.strictEqual(extractCarMake('بدي سيارة هيوندا النترا'), 'Hyundai');
});

test('"نسان" (missing ي) maps to Nissan', () => {
    assert.strictEqual(extractCarMake('شو أسعار نسان سني'), 'Nissan');
});

test('full production message classifies as purchase with car_make=Toyota', () => {
    const r = classify(
        'بدي اشتري سيارة احكيلي الانواع والاسعار عندكم يعني حاطط ببالي تيوتا'
    );
    assert.strictEqual(r.intent, 'purchase');
    assert.strictEqual(r.entities.car_make, 'Toyota');
});

// =============================================================
// Runner
// =============================================================
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
