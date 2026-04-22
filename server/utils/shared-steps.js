/**
 * أوتو جوردن - Shared Step Timer
 *
 * Wraps any async operation with timing, structured error logging, and
 * optional per-step trace collection. Shared between webhook.routes.js
 * (sync path) and process-ai-background.js (background path) so the two
 * never diverge.
 *
 * Usage:
 *   const { step } = require('../utils/shared-steps');
 *   const result = await step('db.getCustomer', () => db.getCustomer(phone), {
 *       critical: true,   // re-throw on failure (stops the pipeline)
 *       timeoutMs: 3000,  // abort if fn takes longer
 *       log: reqLog,      // scoped logger (falls back to root logger)
 *       trace: traceArr,  // array to push { step, ms, ok } entries into
 *   });
 *   if (result.ok) { ... result.result ... }
 */

const logger = require('./logger');
const metrics = require('./metrics');

async function step(name, fn, {
    critical  = false,
    timeoutMs = null,
    log       = logger,
    trace     = null,
} = {}) {
    const t0 = Date.now();
    try {
        const promise = Promise.resolve().then(fn);
        let result;
        if (timeoutMs) {
            let timer;
            const timeoutPromise = new Promise((_, rej) => {
                timer = setTimeout(
                    () => rej(new Error(`step "${name}" timed out after ${timeoutMs}ms`)),
                    timeoutMs
                );
            });
            try {
                result = await Promise.race([promise, timeoutPromise]);
            } finally {
                clearTimeout(timer);
            }
        } else {
            result = await promise;
        }
        const dt = Date.now() - t0;
        log.info(`step:${name} ok`, { step: name, status: 'ok', ms: dt });
        if (trace) trace.push({ step: name, ms: dt, ok: true });
        metrics.observe('step_duration_ms', dt, { step: name, outcome: 'ok' });
        metrics.inc('step_total', 1, { step: name, outcome: 'ok' });
        return { ok: true, result, ms: dt };
    } catch (err) {
        const dt = Date.now() - t0;
        const errKind = err?.code
            || (err?.message?.includes('timed out') ? 'TIMEOUT' : 'ERROR');
        log.error(`step:${name} failed`, {
            step: name, status: 'failed', ms: dt,
            code: err?.code, details: err?.details, err,
        });
        if (trace) trace.push({
            step: name, ms: dt, ok: false,
            err_kind: errKind, err_message: err?.message,
        });
        metrics.observe('step_duration_ms', dt, { step: name, outcome: 'failed' });
        metrics.inc('step_total', 1, { step: name, outcome: 'failed' });
        metrics.inc('step_errors_total', 1, { step: name, err_kind: errKind });
        if (critical) throw err;
        return { ok: false, error: err, ms: dt };
    }
}

module.exports = { step };
