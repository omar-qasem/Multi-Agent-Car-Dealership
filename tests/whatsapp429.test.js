/**
 * P1-03 tests — WhatsApp 429 Retry-After handling
 *
 * Covers:
 *   1. _parseRetryAfter: seconds form → ms (clamped to max).
 *   2. _parseRetryAfter: HTTP-date form → delta-ms (clamped).
 *   3. _parseRetryAfter: missing/garbage → null.
 *   4. _sendWithRetry: 429 with Retry-After header waits the hinted delay.
 *   5. _sendWithRetry: 429 without Retry-After falls back to exponential.
 *   6. _sendWithRetry: 429 that doesn't recover → throws with status=429.
 *   7. _sendWithRetry: 400 is terminal — no retries, nonRetryable flag set.
 *   8. _sendWithRetry: 503 retries (server error).
 *   9. _sendWithRetry: 2xx returns success and stops.
 *  10. Retry-After > cap is clamped to retryAfterMaxMs.
 *
 * We stub the axios module via require.cache and load the service fresh
 * for each scenario so the instance picks up the stub.
 *
 * Run: node tests/whatsapp429.test.js
 */

const assert = require('node:assert');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function loadServiceWithStubbedAxios(axiosPostImpl) {
    const axiosPath = require.resolve('axios');
    require.cache[axiosPath] = {
        id: axiosPath, filename: axiosPath, loaded: true,
        exports: { post: axiosPostImpl, default: { post: axiosPostImpl } },
    };
    // env deps for config/env
    process.env.WHATSAPP_ACCESS_TOKEN = 'stub';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify';

    // Clear service module cache
    const servicePath = require.resolve('../server/services/whatsapp.service');
    delete require.cache[servicePath];
    return require('../server/services/whatsapp.service');
}

function fakeAxiosError({ status, data = {}, headers = {}, message = 'bang' }) {
    const err = new Error(message);
    err.response = { status, data, headers };
    return err;
}

// =========================================================
// 1-3. _parseRetryAfter
// =========================================================
test('_parseRetryAfter: numeric seconds → ms, capped', () => {
    const svc = loadServiceWithStubbedAxios(async () => { throw new Error('unused'); });
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': '1' }), 1000);
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': '2.5' }), 2500);
    // Cap at retryAfterMaxMs = 3000
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': '10' }), 3000);
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': '0' }), 0);
});

test('_parseRetryAfter: HTTP-date → delta-ms, capped', () => {
    const svc = loadServiceWithStubbedAxios(async () => { throw new Error('unused'); });
    // HTTP-date has 1-second precision (RFC 7231 §7.1.1.1), so a 2500ms
    // future date could round down to anywhere in [1500ms, 2500ms] depending
    // on sub-second alignment. Assert a generous range.
    const future = new Date(Date.now() + 2500).toUTCString();
    const val = svc._parseRetryAfter({ 'retry-after': future });
    assert.ok(val >= 1000 && val <= 3000, `expected 1000–3000, got ${val}`);

    const farFuture = new Date(Date.now() + 60_000).toUTCString();
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': farFuture }), 3000,
        'distant dates must clamp to retryAfterMaxMs');

    const past = new Date(Date.now() - 5000).toUTCString();
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': past }), 0,
        'past dates must yield 0 (immediate retry)');
});

test('_parseRetryAfter: missing / malformed → null', () => {
    const svc = loadServiceWithStubbedAxios(async () => { throw new Error('unused'); });
    assert.strictEqual(svc._parseRetryAfter({}), null);
    assert.strictEqual(svc._parseRetryAfter(null), null);
    assert.strictEqual(svc._parseRetryAfter(undefined), null);
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': '' }), null);
    assert.strictEqual(svc._parseRetryAfter({ 'retry-after': 'gibberish' }), null);
});

// =========================================================
// 4. 429 with Retry-After → honors hint
// =========================================================
test('_sendWithRetry: 429 + Retry-After header waits hinted delay then succeeds', async () => {
    let calls = 0;
    const sleeps = [];
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        if (calls === 1) throw fakeAxiosError({ status: 429, headers: { 'retry-after': '1' } });
        return { data: { messages: [{ id: 'wamid.OK' }] } };
    });
    // Monkey-patch _sleep so we don't actually sleep — just record the durations
    svc._sleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

    const result = await svc.sendTextMessage('+962700000100', 'hi');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'wamid.OK');
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(sleeps, [1000], 'should have slept exactly the hinted 1s');
});

// =========================================================
// 5. 429 without Retry-After → fallback exponential
// =========================================================
test('_sendWithRetry: 429 without Retry-After falls back to retryDelay * attempt', async () => {
    let calls = 0;
    const sleeps = [];
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        if (calls === 1) throw fakeAxiosError({ status: 429, headers: {} });
        return { data: { messages: [{ id: 'wamid.OK2' }] } };
    });
    svc._sleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

    await svc.sendTextMessage('+962700000101', 'hi');
    assert.strictEqual(calls, 2);
    // retryDelay=500 × attempt=1 = 500ms
    assert.deepStrictEqual(sleeps, [500]);
});

// =========================================================
// 6. 429 that doesn't recover
// =========================================================
test('_sendWithRetry: 429 persistent → throws with err.status=429', async () => {
    let calls = 0;
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        throw fakeAxiosError({ status: 429, headers: { 'retry-after': '0' } });
    });
    svc._sleep = () => Promise.resolve();

    await assert.rejects(
        () => svc.sendTextMessage('+962700000102', 'hi'),
        (err) => {
            assert.strictEqual(err.status, 429);
            assert.ok(/فشل إرسال الرسالة/.test(err.message));
            return true;
        }
    );
    // retryAttempts=2 → 1 initial + 1 retry = 2 calls total
    assert.strictEqual(calls, 2);
});

// =========================================================
// 7. 4xx terminal — no retries
// =========================================================
test('_sendWithRetry: 400 is terminal — zero retries, nonRetryable flag', async () => {
    let calls = 0;
    let slept = false;
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        throw fakeAxiosError({
            status: 400,
            data: { error: { message: 'Invalid recipient phone number' } },
        });
    });
    svc._sleep = () => { slept = true; return Promise.resolve(); };

    await assert.rejects(
        () => svc.sendTextMessage('+962700000103', 'hi'),
        (err) => {
            assert.strictEqual(err.status, 400);
            assert.strictEqual(err.nonRetryable, true);
            assert.ok(/Invalid recipient phone number/.test(err.message));
            return true;
        }
    );
    assert.strictEqual(calls, 1, 'must not retry on 400');
    assert.strictEqual(slept, false, 'must not have slept at all');
});

test('_sendWithRetry: 401 / 403 / 404 / 410 / 422 are all terminal', async () => {
    for (const status of [401, 403, 404, 410, 422]) {
        let calls = 0;
        const svc = loadServiceWithStubbedAxios(async () => {
            calls++;
            throw fakeAxiosError({ status });
        });
        svc._sleep = () => Promise.resolve();
        await assert.rejects(() => svc.sendTextMessage('+962700000104', 'hi'),
            (err) => { assert.strictEqual(err.nonRetryable, true); return true; });
        assert.strictEqual(calls, 1, `status ${status} must not retry`);
    }
});

// =========================================================
// 8. 5xx retries
// =========================================================
test('_sendWithRetry: 503 retries using exponential backoff then succeeds', async () => {
    let calls = 0;
    const sleeps = [];
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        if (calls === 1) throw fakeAxiosError({ status: 503 });
        return { data: { messages: [{ id: 'wamid.OK3' }] } };
    });
    svc._sleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

    const result = await svc.sendTextMessage('+962700000105', 'hi');
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(sleeps, [500]);
});

// =========================================================
// 9. 2xx success path unchanged
// =========================================================
test('_sendWithRetry: 2xx success returns on first attempt, no sleep', async () => {
    let calls = 0;
    const sleeps = [];
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        return { data: { messages: [{ id: 'wamid.FAST' }] } };
    });
    svc._sleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

    const result = await svc.sendTextMessage('+962700000106', 'hi');
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(sleeps, []);
});

// =========================================================
// 10. Cap enforcement end-to-end
// =========================================================
test('_sendWithRetry: Retry-After > cap is clamped to retryAfterMaxMs', async () => {
    let calls = 0;
    const sleeps = [];
    const svc = loadServiceWithStubbedAxios(async () => {
        calls++;
        if (calls === 1) throw fakeAxiosError({ status: 429, headers: { 'retry-after': '120' } });
        return { data: { messages: [{ id: 'wamid.OK4' }] } };
    });
    svc._sleep = (ms) => { sleeps.push(ms); return Promise.resolve(); };

    await svc.sendTextMessage('+962700000107', 'hi');
    assert.deepStrictEqual(sleeps, [3000],
        'a 120s Retry-After must be clamped to the Lambda-safe cap of 3s');
});

// =========================================================
// Runner
// =========================================================
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
