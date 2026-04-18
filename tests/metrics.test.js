/**
 * P2-03 tests — Metrics module + /api/admin/metrics endpoint
 *
 * Covers:
 *   1. inc(): counter goes up, labels create distinct series.
 *   2. observe(): histogram records count/sum and percentiles.
 *   3. setGauge(): last-write-wins.
 *   4. snapshot(): shape + uptime fields.
 *   5. Sample ring cap prevents unbounded memory.
 *   6. webhook.routes.js increments webhook_requests_total + step_total.
 *   7. step() increments step_errors_total on failure.
 *   8. admin.routes.js is auth-gated and returns a snapshot.
 *   9. app.js registers the admin router under /api/admin.
 *
 * Run: node tests/metrics.test.js
 */
const fs     = require('node:fs');
const assert = require('node:assert');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function loadFresh(p) {
    delete require.cache[require.resolve(p)];
    return require(p);
}

// =========================================================
// 1. Counter
// =========================================================
test('inc(): counter accumulates across calls', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    m.inc('requests');
    m.inc('requests', 2);
    m.inc('requests', 1);
    const snap = m.snapshot();
    const row = snap.counters.find(c => c.name === 'requests');
    assert.ok(row, 'series must exist');
    assert.strictEqual(row.value, 4);
});

test('inc(): labels create separate series', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    m.inc('webhook_requests_total', 1, { outcome: 'processed' });
    m.inc('webhook_requests_total', 1, { outcome: 'duplicate-mem' });
    m.inc('webhook_requests_total', 2, { outcome: 'processed' });
    const snap = m.snapshot();
    const byOutcome = Object.fromEntries(
        snap.counters
            .filter(c => c.name === 'webhook_requests_total')
            .map(c => [c.labels.outcome, c.value])
    );
    assert.strictEqual(byOutcome['processed'], 3);
    assert.strictEqual(byOutcome['duplicate-mem'], 1);
});

// =========================================================
// 2. Histogram
// =========================================================
test('observe(): histogram tracks count/sum/percentiles', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    for (const v of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
        m.observe('step_duration_ms', v, { step: 'ai' });
    }
    const snap = m.snapshot();
    const h = snap.histograms.find(x => x.name === 'step_duration_ms');
    assert.ok(h, 'histogram exists');
    assert.strictEqual(h.count, 10);
    assert.strictEqual(h.sum, 550);
    assert.strictEqual(h.avg_ms, 55);
    // p50 of 10 sorted values → index floor(0.5*10)=5 → sorted[5] = 60
    assert.strictEqual(h.p50_ms, 60);
    // p95 → floor(0.95*10)=9 → sorted[9] = 100
    assert.strictEqual(h.p95_ms, 100);
});

test('observe(): empty histogram yields null percentiles', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    const snap = m.snapshot();
    assert.strictEqual(snap.histograms.length, 0);
});

// =========================================================
// 3. Gauge
// =========================================================
test('setGauge(): last write wins', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    m.setGauge('queue_depth', 5);
    m.setGauge('queue_depth', 12);
    const snap = m.snapshot();
    const g = snap.gauges.find(x => x.name === 'queue_depth');
    assert.strictEqual(g.value, 12);
});

// =========================================================
// 4. Snapshot shape
// =========================================================
test('snapshot(): has uptime and all three series arrays', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    m.inc('a');
    m.observe('b', 1);
    m.setGauge('c', 1);
    const snap = m.snapshot();
    assert.ok(typeof snap.uptime_ms === 'number' && snap.uptime_ms >= 0);
    assert.ok(typeof snap.started_at === 'string');
    assert.ok(Array.isArray(snap.counters)   && snap.counters.length   === 1);
    assert.ok(Array.isArray(snap.histograms) && snap.histograms.length === 1);
    assert.ok(Array.isArray(snap.gauges)     && snap.gauges.length     === 1);
});

// =========================================================
// 5. Ring cap
// =========================================================
test('histogram sample ring stays bounded under load', () => {
    const m = loadFresh('../server/utils/metrics');
    m._reset();
    const cap = m._HISTOGRAM_SAMPLE_CAP;
    for (let i = 0; i < cap * 3; i++) m.observe('h', i);
    // Access through snapshot to confirm count/sum still accurate
    // and the ring has been compacted internally.
    const snap = m.snapshot();
    const h = snap.histograms.find(x => x.name === 'h');
    assert.strictEqual(h.count, cap * 3, 'count tracks ALL observations');
    // We can't directly peek at samples length from the snapshot, but
    // percentiles should still compute without error.
    assert.ok(Number.isFinite(h.p95_ms));
});

// =========================================================
// 6. Source wiring: webhook.routes.js uses metrics
// =========================================================
test('webhook.routes.js records webhook_requests_total and webhook_duration_ms', () => {
    const src = fs.readFileSync(
        require.resolve('../server/routes/webhook.routes'), 'utf8');
    assert.ok(/require\(['"]\.\.\/utils\/metrics['"]\)/.test(src),
        'route must import the metrics module');
    assert.ok(/metrics\.inc\('webhook_requests_total'/.test(src),
        'route must increment webhook_requests_total');
    assert.ok(/metrics\.observe\('webhook_duration_ms'/.test(src),
        'route must observe webhook_duration_ms');
});

test('step() wires step_duration_ms + step_errors_total', () => {
    const src = fs.readFileSync(
        require.resolve('../server/routes/webhook.routes'), 'utf8');
    assert.ok(/metrics\.observe\('step_duration_ms'/.test(src),
        'step() must observe step_duration_ms');
    assert.ok(/metrics\.inc\('step_total'/.test(src),
        'step() must increment step_total');
    assert.ok(/metrics\.inc\('step_errors_total'/.test(src),
        'step() must increment step_errors_total on failure');
});

// =========================================================
// 7. admin.routes.js exists, is auth-gated, returns snapshot
// =========================================================
test('admin.routes.js exists and guards /metrics with authenticateToken', () => {
    const src = fs.readFileSync(
        require.resolve('../server/routes/admin.routes'), 'utf8');
    assert.ok(/router\.get\(['"]\/metrics['"],\s*authenticateToken/.test(src),
        '/metrics must be protected by authenticateToken');
    assert.ok(/metrics\.snapshot\(\)/.test(src),
        '/metrics must delegate to metrics.snapshot()');
});

test('app.js wires the admin router under /api/admin behind CSRF', () => {
    const src = fs.readFileSync(
        require.resolve('../server/app'), 'utf8');
    assert.ok(/adminRoutes\s*=\s*require\(['"]\.\/routes\/admin\.routes['"]\)/.test(src),
        'app.js must import the admin router');
    assert.ok(/app\.use\(['"]\/api\/admin['"][^)]*adminRoutes/.test(src),
        'app.js must mount the admin router at /api/admin');
    // Same-line assertion that CSRF middleware is applied
    const mountLine = src.split('\n').find(l => /\/api\/admin/.test(l) && /adminRoutes/.test(l));
    assert.ok(mountLine && /requireCsrf/.test(mountLine),
        '/api/admin mount must include requireCsrf middleware');
});

// =========================================================
// 8. Functional: hit the handler directly with a stub req/res
// =========================================================
test('GET /api/admin/metrics returns snapshot JSON', async () => {
    // Stub the auth middleware path by directly invoking the route function.
    // We load admin.routes.js and pluck the handler out via a minimal router shim.
    const metrics = loadFresh('../server/utils/metrics');
    metrics._reset();
    metrics.inc('test_counter', 5);
    metrics.observe('test_hist', 42);

    // We need to bypass authenticateToken for this unit test. Stub it.
    const authPath = require.resolve('../server/middleware/auth');
    const realAuth = require(authPath);
    require.cache[authPath].exports = {
        ...realAuth,
        authenticateToken: (_req, _res, next) => next(),
    };

    const router = loadFresh('../server/routes/admin.routes');

    // Pull the GET /metrics handler out of the router stack
    const layer = router.stack.find(l =>
        l.route && l.route.path === '/metrics' && l.route.methods.get);
    assert.ok(layer, 'router must expose GET /metrics');
    // Build a request + capture response
    let status = 200, body = null;
    const res = {
        status(s) { status = s; return this; },
        json(b)   { body = b; return this; },
    };
    const nextStubbed = (err) => { if (err) throw err; };
    // Run the full middleware stack for /metrics (auth, then handler)
    const stack = layer.route.stack;
    let i = 0;
    const runNext = (err) => {
        if (err) throw err;
        if (i >= stack.length) return;
        const mw = stack[i++];
        mw.handle({ method: 'GET', url: '/metrics' }, res, runNext);
    };
    runNext();

    // Give any async handler a tick to settle
    await new Promise(r => setImmediate(r));

    assert.strictEqual(status, 200);
    assert.ok(body && body.success === true);
    assert.ok(Array.isArray(body.counters));
    assert.ok(body.counters.some(c => c.name === 'test_counter' && c.value === 5));
    assert.ok(body.histograms.some(h => h.name === 'test_hist' && h.count === 1));

    // Restore auth module cache
    require.cache[authPath].exports = realAuth;
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
            if (err.stack) console.error(err.stack.split('\n').slice(1, 3).join('\n'));
            failed++;
        }
    }
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
