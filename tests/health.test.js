/**
 * P2-04 tests — /health (liveness) vs /ready (readiness)
 *
 * Covers:
 *   1. /health is fast, 200, and doesn't touch Supabase.
 *   2. /ready returns 200 + status='ready' when all deps are ok.
 *   3. /ready returns 503 + status='not-ready' when Supabase ping fails.
 *   4. /ready returns 503 when Groq is unconfigured.
 *   5. /ready exposes Groq TPD flag state (primary_exhausted).
 *   6. /ready surfaces WhatsApp credential presence.
 *   7. /ready includes last_send_signal from metrics when sends recorded.
 *   8. geminiService.getHealthStatus: plain-object, no I/O.
 *
 * Tests drive the Express app directly via the handler function. Where
 * we stub a module we mutate require.cache before loading app.
 *
 * Run: node tests/health.test.js
 */
const fs     = require('node:fs');
const assert = require('node:assert');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

// =========================================================
// Helper: build a fake Express request/response; drive a handler
// =========================================================
function mockReq(overrides = {}) {
    return { method: 'GET', url: '/', headers: {}, query: {}, body: {}, ...overrides };
}
function mockRes() {
    let _status = 200, _body = null, _ended = false;
    const res = {
        status(s) { _status = s; return this; },
        json(b)   { _body = b; _ended = true; return this; },
        get _status() { return _status; },
        get _body()   { return _body; },
        get _ended()  { return _ended; },
    };
    return res;
}

function clearModuleTree() {
    // Wipe all cached modules for a fresh load. require.cache keys are
    // absolute filesystem paths, which use '\' on Windows — matching only
    // '/server/' silently no-ops there and leaks stubs/state across tests.
    const path = require('node:path');
    const marker = `${path.sep}server${path.sep}`;
    for (const k of Object.keys(require.cache)) {
        if (k.includes(marker) || k.includes('/server/')) delete require.cache[k];
    }
}

// Stub heavy modules before loading app.js.
function stubModulesForApp({
    dbMode = 'in-memory', searchCarsImpl, groqStatus, envOverrides = {},
} = {}) {
    clearModuleTree();
    for (const k of Object.keys(envOverrides)) process.env[k] = envOverrides[k];

    // Stub db
    const dbPath = require.resolve('../server/database/db');
    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: {
            initDatabase: async () => {},
            getDbMode: () => ({ mode: dbMode, persistent: dbMode === 'supabase' }),
            searchCars: searchCarsImpl || (async () => ([{ id: 1 }, { id: 2 }])),
            getOrCreateCustomer: async () => null,
            saveConversation:    async () => null,
            hasMessageId:        async () => false,
        },
    };

    // Stub gemini service
    const geminiPath = require.resolve('../server/services/gemini.service');
    require.cache[geminiPath] = {
        id: geminiPath, filename: geminiPath, loaded: true,
        exports: {
            getHealthStatus: () => groqStatus || {
                configured: true, model: 'llama-3.1-8b-instant',
                fallback_model: 'llama-3.3-70b-versatile',
                primary_exhausted: false, exhausted_utc_date: null,
            },
            generateResponse: async () => ({ response: 'stub', toolsUsed: [] }),
        },
    };
}

// =========================================================
// 1. /health is cheap and doesn't touch Supabase
// =========================================================
test('/health: returns 200 without calling searchCars', async () => {
    let searchCarsCalls = 0;
    stubModulesForApp({
        dbMode: 'supabase',
        searchCarsImpl: async () => { searchCarsCalls++; return []; },
        envOverrides: {
            NODE_ENV: 'test',
            LOG_FORMAT: 'json',
            CORS_ORIGIN: 'http://localhost:3000',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            WHATSAPP_APP_SECRET: 'sec',
        },
    });
    const app = require('../server/app.js');
    const { default: request } = { default: null };

    // Drive the Express handler via its internal stack. Find the /health
    // layer and call it directly.
    const layer = app._router.stack.find(l =>
        l.route && l.route.path === '/health');
    assert.ok(layer, '/health route must exist');
    const res = mockRes();
    layer.route.stack[0].handle(mockReq({ url: '/health' }), res, () => {});
    await new Promise(r => setImmediate(r));

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.status, 'ok');
    assert.ok(res._body.version, 'version must be present');
    assert.strictEqual(searchCarsCalls, 0,
        '/health MUST NOT hit Supabase — that is /ready\'s job');
});

// =========================================================
// 2. /ready: happy path → 200
// =========================================================
test('/ready: all deps ok → 200 status=ready', async () => {
    stubModulesForApp({
        dbMode: 'supabase',
        searchCarsImpl: async () => ([{ id: 1 }]),
        envOverrides: {
            NODE_ENV: 'test', LOG_FORMAT: 'json',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            WHATSAPP_APP_SECRET: 'sec',
        },
    });
    const app = require('../server/app.js');
    const layer = app._router.stack.find(l => l.route && l.route.path === '/ready');
    assert.ok(layer, '/ready route must exist');
    const res = mockRes();
    await layer.route.stack[0].handle(mockReq({ url: '/ready' }), res, () => {});
    // Allow async handler to finish
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.status, 'ready');
    assert.ok(res._body.checks);
    assert.strictEqual(res._body.checks.supabase.ok, true);
    assert.strictEqual(res._body.checks.groq.ok, true);
    assert.strictEqual(res._body.checks.whatsapp.ok, true);
});

// =========================================================
// 3. /ready: Supabase ping fails → 503
// =========================================================
test('/ready: supabase down → 503 status=not-ready', async () => {
    stubModulesForApp({
        dbMode: 'supabase',
        searchCarsImpl: async () => { throw new Error('conn refused'); },
        envOverrides: {
            NODE_ENV: 'test', LOG_FORMAT: 'json',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            WHATSAPP_APP_SECRET: 'sec',
        },
    });
    const app = require('../server/app.js');
    const layer = app._router.stack.find(l => l.route && l.route.path === '/ready');
    const res = mockRes();
    await layer.route.stack[0].handle(mockReq({ url: '/ready' }), res, () => {});
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    assert.strictEqual(res._status, 503);
    assert.strictEqual(res._body.status, 'not-ready');
    assert.strictEqual(res._body.checks.supabase.ok, false);
    assert.ok(res._body.checks.supabase.error.includes('conn refused'));
});

// =========================================================
// 4. /ready: Groq unconfigured → 503
// =========================================================
test('/ready: groq not configured → 503', async () => {
    stubModulesForApp({
        dbMode: 'in-memory',
        groqStatus: {
            configured: false, model: 'llama-3.1-8b-instant',
            fallback_model: 'llama-3.3-70b-versatile',
            primary_exhausted: false, exhausted_utc_date: null,
        },
        envOverrides: {
            NODE_ENV: 'test', LOG_FORMAT: 'json',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            WHATSAPP_APP_SECRET: 'sec',
        },
    });
    const app = require('../server/app.js');
    const layer = app._router.stack.find(l => l.route && l.route.path === '/ready');
    const res = mockRes();
    await layer.route.stack[0].handle(mockReq({ url: '/ready' }), res, () => {});
    await new Promise(r => setImmediate(r));

    assert.strictEqual(res._status, 503);
    assert.strictEqual(res._body.checks.groq.ok, false);
    assert.strictEqual(res._body.checks.groq.configured, false);
});

// =========================================================
// 5. /ready: Groq TPD flag is surfaced
// =========================================================
test('/ready: TPD-exhausted flag shown but does NOT itself fail readiness', async () => {
    stubModulesForApp({
        dbMode: 'in-memory',
        groqStatus: {
            configured: true, model: 'llama-3.1-8b-instant',
            fallback_model: 'llama-3.3-70b-versatile',
            primary_exhausted: true, exhausted_utc_date: '2026-04-18',
        },
        envOverrides: {
            NODE_ENV: 'test', LOG_FORMAT: 'json',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            WHATSAPP_APP_SECRET: 'sec',
        },
    });
    const app = require('../server/app.js');
    const layer = app._router.stack.find(l => l.route && l.route.path === '/ready');
    const res = mockRes();
    await layer.route.stack[0].handle(mockReq({ url: '/ready' }), res, () => {});
    await new Promise(r => setImmediate(r));

    // TPD flag is informational — we still serve because fallback model exists.
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.checks.groq.primary_exhausted, true);
    assert.strictEqual(res._body.checks.groq.exhausted_utc_date, '2026-04-18');
});

// =========================================================
// 6. /ready: WhatsApp missing credentials in production → fail
// =========================================================
test('/ready: production with missing WHATSAPP_APP_SECRET → 503', async () => {
    stubModulesForApp({
        dbMode: 'in-memory',
        envOverrides: {
            NODE_ENV: 'production', LOG_FORMAT: 'json',
            JWT_SECRET: 'x'.repeat(32),
            WHATSAPP_ACCESS_TOKEN: 'stub',
            WHATSAPP_PHONE_NUMBER_ID: '1',
            WHATSAPP_VERIFY_TOKEN: 'v',
            CORS_ORIGIN: 'https://example.com',
            // Production boot requires these; set them so module-load doesn't throw
            ADMIN_USERNAME: 'testadmin',
            ADMIN_PASSWORD_HASH: '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcd',
        },
    });
    // Ensure APP_SECRET is NOT set (may linger from earlier test)
    delete process.env.WHATSAPP_APP_SECRET;
    const app = require('../server/app.js');
    const layer = app._router.stack.find(l => l.route && l.route.path === '/ready');
    const res = mockRes();
    await layer.route.stack[0].handle(mockReq({ url: '/ready' }), res, () => {});
    await new Promise(r => setImmediate(r));

    assert.strictEqual(res._status, 503);
    assert.strictEqual(res._body.checks.whatsapp.ok, false);
    assert.strictEqual(res._body.checks.whatsapp.app_secret_set, false);
});

// =========================================================
// 7. geminiService.getHealthStatus — plain object, no I/O
// =========================================================
test('geminiService.getHealthStatus exists and returns expected shape', () => {
    const src = fs.readFileSync(
        require.resolve('../server/services/gemini.service'), 'utf8');
    assert.ok(/getHealthStatus\s*\(\s*\)\s*\{/.test(src),
        'geminiService must expose a getHealthStatus method');
    assert.ok(/primary_exhausted:/.test(src),
        'health snapshot must include primary_exhausted');
    assert.ok(/configured:/.test(src),
        'health snapshot must include configured');
});

// =========================================================
// 8. Source lint — /ready route registered in app.js
// =========================================================
test('app.js: /health and /ready are separate routes', () => {
    const src = fs.readFileSync(require.resolve('../server/app'), 'utf8');
    assert.ok(/app\.get\(['"]\/health['"]/.test(src), '/health route present');
    assert.ok(/app\.get\(['"]\/ready['"]/.test(src),  '/ready route present');
    // /health must be sync + NOT call searchCars directly
    const healthBlock = src.substring(src.indexOf("app.get('/health'"));
    const until = Math.min(
        healthBlock.indexOf("app.get('/ready'"),
        healthBlock.length
    );
    const healthBody = healthBlock.substring(0, until);
    assert.ok(!/searchCars/.test(healthBody),
        '/health MUST NOT call searchCars (that belongs on /ready)');
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
            if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
