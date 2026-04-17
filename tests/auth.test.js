/**
 * P0-05 + P0-07: Auth hardening tests
 *   - bcrypt password hashing (no plaintext comparison)
 *   - JWT_SECRET enforcement in production
 *   - HttpOnly session cookie on login
 *   - CSRF double-submit enforcement on mutating routes
 *
 * Run: node tests/auth.test.js
 */

const assert = require('node:assert');
const path   = require('node:path');
const bcrypt = require('bcryptjs');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// Mock Express req/res
function mockRes() {
    const res = {
        _status: 200, _body: null, _cookies: {},
        status(c) { this._status = c; return this; },
        json(b)   { this._body   = b; return this; },
        cookie(name, value, opts = {}) { this._cookies[name] = { value, opts }; return this; },
        clearCookie(name)               { this._cookies[name] = { value: '', opts: { maxAge: 0 } }; return this; },
    };
    return res;
}
function mockReq({ method = 'POST', body = {}, headers = {}, cookies = {} } = {}) {
    return { method, body, headers, cookies };
}

function loadAuthFresh({ production = false, adminHash = null, jwtSecret = null } = {}) {
    // Reset relevant env
    if (production) process.env.NODE_ENV = 'production';
    else delete process.env.NODE_ENV;

    process.env.JWT_SECRET = jwtSecret ?? 'a'.repeat(40);
    if (adminHash) process.env.ADMIN_PASSWORD_HASH = adminHash;
    else delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_USERNAME = 'admin';

    // Clear ALL relevant caches
    const envPath  = require.resolve('../server/config/env');
    const authPath = require.resolve('../server/middleware/auth');
    delete require.cache[envPath];
    delete require.cache[authPath];
    return require('../server/middleware/auth');
}

// =============================================================
// P0-05: bcrypt + JWT secret enforcement
// =============================================================
test('env: production aborts if JWT_SECRET missing', () => {
    const envPath = require.resolve('../server/config/env');
    delete require.cache[envPath];
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => require('../server/config/env'), /JWT_SECRET/);
    delete process.env.NODE_ENV;
});

test('env: production aborts if JWT_SECRET too short', () => {
    const envPath = require.resolve('../server/config/env');
    delete require.cache[envPath];
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'too_short';
    assert.throws(() => require('../server/config/env'), /too short/i);
    delete process.env.NODE_ENV;
});

test('env: production aborts if JWT_SECRET looks like a placeholder', () => {
    const envPath = require.resolve('../server/config/env');
    delete require.cache[envPath];
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'please_change_this_secret_it_is_32_chars';
    assert.throws(() => require('../server/config/env'), /placeholder/i);
    delete process.env.NODE_ENV;
});

test('env: production accepts a strong random JWT_SECRET', () => {
    const envPath = require.resolve('../server/config/env');
    delete require.cache[envPath];
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
    assert.doesNotThrow(() => require('../server/config/env'));
    delete process.env.NODE_ENV;
});

test('auth: production aborts if ADMIN_PASSWORD_HASH missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.ADMIN_USERNAME = 'admin'; // set so we get past that check
    delete process.env.ADMIN_PASSWORD_HASH;
    const envPath  = require.resolve('../server/config/env');
    const authPath = require.resolve('../server/middleware/auth');
    delete require.cache[envPath];
    delete require.cache[authPath];
    assert.throws(() => require('../server/middleware/auth'), /ADMIN_PASSWORD_HASH/);
    delete process.env.NODE_ENV;
});

test('login: rejects wrong password (bcrypt)', async () => {
    const hash = bcrypt.hashSync('correctHorseBatteryStaple', 10);
    const auth = loadAuthFresh({ adminHash: hash });
    const res = mockRes();
    await auth.login(mockReq({ body: { username: 'admin', password: 'wrong' } }), res);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._body.success, false);
    assert.strictEqual(res._cookies.aj_session, undefined, 'no cookie on bad login');
});

test('login: rejects unknown username (bcrypt, timing-equalized)', async () => {
    const hash = bcrypt.hashSync('correctHorseBatteryStaple', 10);
    const auth = loadAuthFresh({ adminHash: hash });
    const res = mockRes();
    await auth.login(mockReq({ body: { username: 'nobody', password: 'whatever' } }), res);
    assert.strictEqual(res._status, 401);
});

test('login: accepts correct password → sets HttpOnly cookie + CSRF cookie', async () => {
    const hash = bcrypt.hashSync('correctHorseBatteryStaple', 10);
    const auth = loadAuthFresh({ adminHash: hash });
    const res = mockRes();
    await auth.login(mockReq({ body: { username: 'admin', password: 'correctHorseBatteryStaple' } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.success, true);
    assert.ok(typeof res._body.token === 'string' && res._body.token.length > 20);
    assert.ok(typeof res._body.csrfToken === 'string' && res._body.csrfToken.length >= 32);

    const sessionCookie = res._cookies.aj_session;
    assert.ok(sessionCookie, 'aj_session cookie must be set');
    assert.strictEqual(sessionCookie.opts.httpOnly, true, 'session cookie MUST be HttpOnly');
    assert.strictEqual(sessionCookie.opts.sameSite, 'lax');

    const csrfCookie = res._cookies.aj_csrf;
    assert.ok(csrfCookie, 'aj_csrf cookie must be set');
    assert.strictEqual(csrfCookie.opts.httpOnly, false, 'CSRF cookie must be readable by JS');
    assert.strictEqual(csrfCookie.value, res._body.csrfToken, 'csrf cookie must match csrfToken in body');
});

test('login: rejects non-string inputs (type confusion)', async () => {
    const hash = bcrypt.hashSync('correctHorseBatteryStaple', 10);
    const auth = loadAuthFresh({ adminHash: hash });
    const res = mockRes();
    // attacker sends {username: {$gt: ""}} style
    await auth.login(mockReq({ body: { username: { $gt: '' }, password: { $gt: '' } } }), res);
    assert.strictEqual(res._status, 400);
});

// =============================================================
// P0-07: CSRF double-submit
// =============================================================
test('requireCsrf: GET passes without tokens', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    let called = false;
    auth.requireCsrf(req, res, () => { called = true; });
    assert.strictEqual(called, true);
});

test('requireCsrf: POST without cookie → 403', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({ method: 'POST', headers: { 'x-csrf-token': 'abc' }, cookies: {} });
    const res = mockRes();
    let called = false;
    auth.requireCsrf(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._body.reason, 'csrf_check_failed');
});

test('requireCsrf: POST with mismatched header → 403', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({
        method: 'POST',
        headers: { 'x-csrf-token': 'different' },
        cookies: { aj_csrf: 'expected' },
    });
    const res = mockRes();
    let called = false;
    auth.requireCsrf(req, res, () => { called = true; });
    assert.strictEqual(res._status, 403);
    assert.strictEqual(called, false);
});

test('requireCsrf: POST with matching header passes', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({
        method: 'POST',
        headers: { 'x-csrf-token': 'same-token' },
        cookies: { aj_csrf: 'same-token' },
    });
    const res = mockRes();
    let called = false;
    auth.requireCsrf(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res._status, 200);
});

test('requireCsrf: Bearer-token POST is exempt (no cookie needed)', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({
        method: 'POST',
        headers: { authorization: 'Bearer sometoken' },
    });
    const res = mockRes();
    let called = false;
    auth.requireCsrf(req, res, () => { called = true; });
    assert.strictEqual(called, true);
});

// =============================================================
// authenticateToken: cookie path + Bearer path
// =============================================================
test('authenticateToken: accepts cookie-based JWT', () => {
    const jwt = require('jsonwebtoken');
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, process.env.JWT_SECRET);
    const req = mockReq({ method: 'GET', cookies: { aj_session: token } });
    const res = mockRes();
    let called = false;
    auth.authenticateToken(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(req.user.username, 'admin');
});

test('authenticateToken: rejects invalid JWT', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({ method: 'GET', cookies: { aj_session: 'not.a.jwt' } });
    const res = mockRes();
    let called = false;
    auth.authenticateToken(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res._status, 403);
});

test('authenticateToken: no token → 401', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    let called = false;
    auth.authenticateToken(req, res, () => { called = true; });
    assert.strictEqual(res._status, 401);
});

test('logout: clears both cookies', () => {
    const auth = loadAuthFresh({ adminHash: bcrypt.hashSync('x', 4) });
    const res = mockRes();
    auth.logout(mockReq({ method: 'POST' }), res);
    assert.ok('aj_session' in res._cookies);
    assert.ok('aj_csrf' in res._cookies);
});

// =============================================================
// Runner
// =============================================================
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
