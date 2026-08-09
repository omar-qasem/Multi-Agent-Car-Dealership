/**
 * P2-01 tests — Structured logging + correlation context
 *
 * Covers:
 *   1. Pretty format in dev: prefix contains the level tag and message.
 *   2. JSON format in production: every line parses to JSON with ts, level, msg.
 *   3. logger.child(ctx) injects context fields onto every record.
 *   4. Nested children merge context; child keys override root keys.
 *   5. Frozen context — child cannot mutate the parent's bound context.
 *   6. Error passed as `data` is serialized with message + stack (not as "{}").
 *   7. Plain-object `data` is spread into the JSON record.
 *   8. Null / undefined `data` is fine (no key pollution).
 *   9. Circular objects don't throw — logger falls back safely.
 *  10. All six methods (info/success/warn/error/webhook/ai) emit to the
 *      correct console stream with the level field set correctly.
 *  11. webhook.routes.js still threads a correlation context through
 *      req handler (structural assertion on source).
 *
 * Run: node tests/logger.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function loadFreshLogger() {
    const p = require.resolve('../server/utils/logger');
    delete require.cache[p];
    return require('../server/utils/logger');
}

/**
 * Capture console.log/.warn/.error output during `fn`. Returns an array
 * of `{ stream, args }` for every write.
 */
async function captureConsole(fn) {
    const captures = [];
    const orig = {
        log: console.log, warn: console.warn, error: console.error,
    };
    console.log   = (...a) => captures.push({ stream: 'log',   args: a });
    console.warn  = (...a) => captures.push({ stream: 'warn',  args: a });
    console.error = (...a) => captures.push({ stream: 'error', args: a });
    try { await fn(); }
    finally {
        console.log = orig.log;
        console.warn = orig.warn;
        console.error = orig.error;
    }
    return captures;
}

function withEnv(vars, fn) {
    const snapshot = {};
    for (const k of Object.keys(vars)) snapshot[k] = process.env[k];
    Object.assign(process.env, vars);
    const restore = () => {
        for (const k of Object.keys(vars)) {
            if (snapshot[k] === undefined) delete process.env[k];
            else process.env[k] = snapshot[k];
        }
    };
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
}

// =========================================================
// 1. Pretty format
// =========================================================
test('pretty format: contains level tag and message', async () => {
    await withEnv({ LOG_FORMAT: 'pretty', NODE_ENV: 'development' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => {
            logger.info('hello world');
        });
        assert.strictEqual(caps.length, 1);
        assert.strictEqual(caps[0].stream, 'log');
        const line = caps[0].args[0];
        assert.ok(/\[INFO\]/.test(line), `expected [INFO] in: ${line}`);
        assert.ok(/hello world/.test(line));
    });
});

// =========================================================
// 2. JSON format in production
// =========================================================
test('json format: every line parses as JSON with ts/level/msg', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => {
            logger.info('api ready');
        });
        assert.strictEqual(caps.length, 1);
        const parsed = JSON.parse(caps[0].args[0]);
        assert.strictEqual(parsed.level, 'info');
        assert.strictEqual(parsed.msg,   'api ready');
        assert.ok(typeof parsed.ts === 'string' && /\d{4}-\d{2}-\d{2}T/.test(parsed.ts));
    });
});

test('json format: NODE_ENV=production defaults to json', async () => {
    await withEnv({ NODE_ENV: 'production', LOG_FORMAT: '' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => logger.info('prod line'));
        const parsed = JSON.parse(caps[0].args[0]);
        assert.strictEqual(parsed.msg, 'prod line');
    });
});

// =========================================================
// 3 & 4. child() injects + merges context
// =========================================================
test('child(ctx): context appears on every record', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const scoped = logger.child({ request_id: 'req_123', phone: '+962700000001' });
        const caps = await captureConsole(async () => {
            scoped.info('first');
            scoped.warn('second');
        });
        const a = JSON.parse(caps[0].args[0]);
        const b = JSON.parse(caps[1].args[0]);
        assert.strictEqual(a.request_id, 'req_123');
        assert.strictEqual(a.phone,      '+962700000001');
        assert.strictEqual(b.request_id, 'req_123');
        assert.strictEqual(b.phone,      '+962700000001');
    });
});

test('child(ctx).child(more): nested merge; inner wins on collision', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const outer = logger.child({ request_id: 'req_A', stage: 'parse' });
        const inner = outer.child({ stage: 'ai', message_id: 'wamid.X' });
        const caps = await captureConsole(async () => inner.info('step'));
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.request_id, 'req_A',   'outer key preserved');
        assert.strictEqual(rec.stage,      'ai',      'inner key wins');
        assert.strictEqual(rec.message_id, 'wamid.X', 'inner adds new key');
    });
});

test('child context is frozen; caller cannot mutate after handoff', async () => {
    const logger = loadFreshLogger();
    const ctx = { request_id: 'req_F' };
    const scoped = logger.child(ctx);
    // Mutate the original object the caller passed in — must not affect child,
    // because child() takes a shallow copy.
    ctx.request_id = 'MUTATED';
    ctx.injected   = 'BAD';
    const bound = scoped._getContext();
    assert.strictEqual(bound.request_id, 'req_F');
    assert.strictEqual(bound.injected, undefined);
    // And the bound context itself must be frozen so even downstream code
    // can't mutate it. (In sloppy mode a direct assignment silently fails,
    // so we assert Object.isFrozen instead of relying on a thrown TypeError.)
    assert.strictEqual(Object.isFrozen(bound), true);
});

// =========================================================
// 5. Error serialization
// =========================================================
test('Error passed as data: serialized with message + stack', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const err = new Error('boom');
        err.code = 'ECONNRESET';
        err.status = 503;
        const caps = await captureConsole(async () => logger.error('send failed', err));
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.level, 'error');
        assert.strictEqual(rec.msg,   'send failed');
        assert.ok(rec.err, 'err field must be present');
        assert.strictEqual(rec.err.message, 'boom');
        assert.strictEqual(rec.err.code,    'ECONNRESET');
        assert.strictEqual(rec.err.status,  503);
        assert.ok(typeof rec.err.stack === 'string' && rec.err.stack.includes('boom'));
    });
});

test('Error nested inside a plain-object data: promoted to serialized form', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const err = new Error('nested-bang');
        const caps = await captureConsole(async () =>
            logger.warn('step failed', { step: 'ai', err })
        );
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.step, 'ai');
        assert.strictEqual(rec.err.message, 'nested-bang');
        assert.ok(rec.err.stack, 'stack must be preserved');
    });
});

test('axios-shaped error: response.status and response.data survive', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const err = new Error('429 dance');
        err.response = { status: 429, data: { error: { message: 'rate limited' } } };
        const caps = await captureConsole(async () => logger.error('whatsapp', err));
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.err.response.status, 429);
        assert.strictEqual(rec.err.response.data.error.message, 'rate limited');
    });
});

// =========================================================
// 6-8. Data merging edge cases
// =========================================================
test('plain-object data is spread into the JSON record', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () =>
            logger.info('step ok', { step: 'send', ms: 42, to: '+962700000001' })
        );
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.step, 'send');
        assert.strictEqual(rec.ms,   42);
        assert.strictEqual(rec.to,   '+962700000001');
    });
});

test('null/undefined data is accepted and leaves the record clean', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => {
            logger.info('a', null);
            logger.info('b', undefined);
            logger.info('c');
        });
        for (const cap of caps) {
            const rec = JSON.parse(cap.args[0]);
            // No stray "detail" / "err" keys from null coercion
            assert.strictEqual(rec.detail, undefined);
            assert.strictEqual(rec.err,    undefined);
        }
    });
});

test('string data is put under .detail', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => logger.info('msg', 'extra text'));
        const rec = JSON.parse(caps[0].args[0]);
        assert.strictEqual(rec.detail, 'extra text');
    });
});

test('circular object does not throw, falls back to a safe string', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const a = {}; a.self = a;
        let threw = false;
        try {
            const caps = await captureConsole(async () => logger.info('circ', { a }));
            assert.strictEqual(caps.length >= 1, true,
                'must still emit something even with a circular payload');
        } catch { threw = true; }
        assert.strictEqual(threw, false, 'logger must NEVER propagate an exception');
    });
});

// =========================================================
// 9. Level-to-stream mapping
// =========================================================
test('levels route to the correct console stream', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => {
            logger.info('i');
            logger.success('s');
            logger.warn('w');
            logger.error('e');
            logger.webhook('wh');
            logger.ai('ai');
        });
        const byStream = caps.map(c => [c.stream, JSON.parse(c.args[0]).level]);
        assert.deepStrictEqual(byStream, [
            ['log',   'info'],
            ['log',   'success'],
            ['warn',  'warn'],
            ['error', 'error'],
            ['log',   'webhook'],
            ['log',   'ai'],
        ]);
    });
});

// =========================================================
// 10. Logger.info with a large message — JSON line still one-per-call
// =========================================================
test('exactly one emit per call', async () => {
    await withEnv({ LOG_FORMAT: 'json' }, async () => {
        const logger = loadFreshLogger();
        const caps = await captureConsole(async () => {
            logger.info('one');
            logger.warn('two');
            logger.error('three');
        });
        assert.strictEqual(caps.length, 3,
            'each call must emit exactly one console write');
    });
});

// =========================================================
// 11. webhook.routes.js threads correlation context
// =========================================================
test('webhook.routes.js: generates request_id and builds a child logger', () => {
    const src = fs.readFileSync(
        require.resolve('../server/routes/webhook.routes'), 'utf8');
    assert.ok(/newRequestId/.test(src), 'must define newRequestId helper');
    assert.ok(/logger\.child\(\{\s*request_id/.test(src),
        'route handler must build a child logger with request_id');
    assert.ok(/message_id: message\.id/.test(src),
        'correlation context must include message_id');
    assert.ok(/phone: message\.from/.test(src),
        'correlation context must include phone');
    assert.ok(/incoming\.log/.test(src),
        'processMessage must receive the scoped logger via incoming.log');
});

test('step() helper accepts a log override for correlation', () => {
    // step() itself now lives in shared-steps.js (extracted so
    // webhook.routes.js and process-ai-background.js share one
    // implementation) — its `log = logger` default lives there.
    const stepSrc = fs.readFileSync(
        require.resolve('../server/utils/shared-steps'), 'utf8');
    assert.ok(/log\s*=\s*logger/.test(stepSrc),
        'step() options must default log to root logger');

    // Every step() call in processMessage must forward the scoped log.
    // After P2-02 the canonical trailing-option shape is `, log, trace }`
    // for pipeline steps, and `, log }` for one-offs — either forwards log.
    const routeSrc = fs.readFileSync(
        require.resolve('../server/routes/webhook.routes'), 'utf8');
    const matches = routeSrc.match(/,\s*log(?:,\s*trace)?\s*\}/g) || [];
    assert.ok(matches.length >= 6,
        `expected ≥6 step() calls to forward log, found ${matches.length}`);
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
    // Logger tests monkey-patch console; restore before the final print
    // just in case a failing test left them swapped.
    console.log(`\n${passed}/${TESTS.length} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
