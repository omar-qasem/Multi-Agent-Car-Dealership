/**
 * Unit tests for server/middleware/webhookSignature.js
 *
 * Run with: node tests/webhookSignature.test.js
 * Exits with code 0 on success, 1 on any failure.
 */

const assert = require('node:assert');
const crypto = require('node:crypto');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function mockRes() {
    return {
        _status: null,
        _body: null,
        status(code) { this._status = code; return this; },
        json(body) { this._body = body; return this; },
    };
}

function mockReq({ method = 'POST', headers = {}, rawBody = Buffer.from('{}') } = {}) {
    return { method, headers, rawBody };
}

function loadModule() {
    // clear require cache so env changes take effect for each test
    const path = require.resolve('../server/middleware/webhookSignature');
    delete require.cache[path];
    return require('../server/middleware/webhookSignature');
}

// ============================================================
test('safeEqualHex: identical hex strings return true', () => {
    const { safeEqualHex } = loadModule();
    assert.strictEqual(safeEqualHex('abcd1234', 'abcd1234'), true);
});

test('safeEqualHex: different hex strings return false', () => {
    const { safeEqualHex } = loadModule();
    assert.strictEqual(safeEqualHex('abcd1234', 'abcd1235'), false);
});

test('safeEqualHex: different lengths return false (no throw)', () => {
    const { safeEqualHex } = loadModule();
    assert.strictEqual(safeEqualHex('abcd', 'abcd12'), false);
});

test('safeEqualHex: non-string inputs return false', () => {
    const { safeEqualHex } = loadModule();
    assert.strictEqual(safeEqualHex(null, 'abcd'), false);
    assert.strictEqual(safeEqualHex('abcd', undefined), false);
    assert.strictEqual(safeEqualHex(123, 456), false);
});

test('computeSignature: produces expected hex', () => {
    const { computeSignature } = loadModule();
    const secret = 'my_secret';
    const body = Buffer.from('{"test":1}');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.strictEqual(computeSignature(body, secret), expected);
});

// --- Middleware behaviors --------------------------------

test('verifyMetaSignature: GET passes through without checking', () => {
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature } = loadModule();
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res._status, null);
});

test('verifyMetaSignature: production + missing APP_SECRET returns 500', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature } = loadModule();
    const req = mockReq();
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._body.reason, 'signature_verification_unconfigured');
});

test('verifyMetaSignature: dev + missing APP_SECRET allows through', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    process.env.NODE_ENV = 'development';
    process.env.WHATSAPP_ALLOW_UNSIGNED = 'true';
    const { verifyMetaSignature } = loadModule();
    const req = mockReq();
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res._status, null);
});

test('verifyMetaSignature: APP_SECRET set but raw body missing returns 400', () => {
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature } = loadModule();
    const req = { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=deadbeef' }, rawBody: undefined };
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._body.reason, 'raw_body_missing');
});

test('verifyMetaSignature: missing header returns 401', () => {
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature } = loadModule();
    const req = mockReq({ headers: {}, rawBody: Buffer.from('{}') });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.reason, 'signature_missing');
});

test('verifyMetaSignature: malformed header (no sha256= prefix) returns 401', () => {
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature } = loadModule();
    const req = mockReq({ headers: { 'x-hub-signature-256': 'just-a-hex-string' }, rawBody: Buffer.from('{}') });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.reason, 'signature_missing');
});

test('verifyMetaSignature: tampered body returns 401', () => {
    process.env.WHATSAPP_APP_SECRET = 'secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature, computeSignature } = loadModule();
    const signedBody = Buffer.from('{"original":true}');
    const tamperedBody = Buffer.from('{"original":false}');
    const sig = computeSignature(signedBody, 'secret');
    const req = mockReq({ headers: { 'x-hub-signature-256': sig }, rawBody: tamperedBody });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.reason, 'signature_mismatch');
});

test('verifyMetaSignature: wrong secret returns 401', () => {
    process.env.WHATSAPP_APP_SECRET = 'correct_secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature, computeSignature } = loadModule();
    const body = Buffer.from('{"original":true}');
    // Attacker signs with a different secret
    const sig = computeSignature(body, 'attacker_secret');
    const req = mockReq({ headers: { 'x-hub-signature-256': sig }, rawBody: body });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.reason, 'signature_mismatch');
});

test('verifyMetaSignature: valid signature calls next()', () => {
    process.env.WHATSAPP_APP_SECRET = 'the_secret';
    process.env.NODE_ENV = 'production';
    const { verifyMetaSignature, computeSignature } = loadModule();
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const sig = computeSignature(body, 'the_secret');
    const req = mockReq({ headers: { 'x-hub-signature-256': sig }, rawBody: body });
    const res = mockRes();
    let called = false;
    verifyMetaSignature(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res._status, null);
});

// ============================================================
// Runner
// ============================================================
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
