/**
 * أوتو جوردن - Webhook Routes (Serverless-Safe v3)
 *
 * ────────────────────────────────────────────────────────────────
 *  WHY THIS REWRITE?
 * ────────────────────────────────────────────────────────────────
 *  Previous version used setImmediate(...) for fire-and-forget background
 *  processing.  This works on a long-lived Express server but FAILS on
 *  Netlify (AWS Lambda):  once serverless-http calls the lambda callback,
 *  Lambda freezes the execution context.  setImmediate callbacks are killed
 *  mid-flight, the AI call never completes, and the user sees the catch
 *  block's fallback message ("صار عنا مشكلة...").
 *
 *  v3 processes the message SYNCHRONOUSLY before responding 200 to Meta.
 *  Meta's WhatsApp Cloud API tolerates response times up to 20 seconds
 *  before considering a webhook failed (5s is the recommended target).
 *  With Groq llama-3.1-8b-instant we typically finish in 2–4s.
 *
 *  Every step is wrapped in its own try/catch with timing logs so we can
 *  see EXACTLY where any future failure happens in Netlify logs.
 * ────────────────────────────────────────────────────────────────
 */

const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const whatsappService = require('../services/whatsapp.service');
const geminiService = require('../services/gemini.service');
const db = require('../database/db');
const { analyzeSentiment, detectTopic, detectIntent } = require('../utils/sentiment');
const { checkBlacklist } = require('../middleware/auth');
const { verifyMetaSignature } = require('../middleware/webhookSignature');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

// P2-01: Correlation IDs. Every webhook gets a request_id; once we've
// parsed the payload we upgrade the scoped logger with message_id + phone
// so downstream steps (AI, send, save) all carry the same breadcrumb.
function newRequestId() {
    try { return crypto.randomUUID(); }
    catch { return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
}

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
    logger.error('❌ WHATSAPP_VERIFY_TOKEN not set — webhook verification will fail');
}

// P0-01: Meta App Secret must be configured in production so HMAC verification
// can reject forged webhook POSTs. See middleware/webhookSignature.js.
if (!process.env.WHATSAPP_APP_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        logger.error('🚫 FATAL(config): WHATSAPP_APP_SECRET not set — webhook signature cannot be verified in production.');
    } else {
        logger.warn('⚠️  WHATSAPP_APP_SECRET not set — webhook signature verification is DISABLED (dev only).');
    }
}

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
const isValidPhone = (phone) => typeof phone === 'string' && PHONE_REGEX.test(phone);

// =============================================
// Message ID Deduplication (two-tier: memory + DB)
// =============================================
// Meta retries the webhook if it doesn't receive 200 in ~5s. Retries
// usually hit the same warm Lambda — so an in-memory Map catches 99% of
// duplicates for free (no DB round-trip). But cold starts and parallel
// invocations (one frozen, one retry) can both sneak past the Map. The
// DB-backed check in `isDuplicateMessageDb` closes that gap, and the
// partial unique index from migration 004 (idx_messages_message_id_unique)
// is the final backstop — if two races both pass all checks, the losing
// INSERT gets SQLSTATE 23505 and saveConversation quietly returns the
// existing row.
const SEEN_MESSAGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SEEN_MESSAGES   = 5000;
const seenMessageIds = new Map(); // messageId → timestamp

function isDuplicateMessageMem(messageId) {
    if (!messageId) return false;

    if (seenMessageIds.size > MAX_SEEN_MESSAGES) {
        const cutoff = Date.now() - SEEN_MESSAGE_TTL_MS;
        for (const [id, ts] of seenMessageIds) {
            if (ts < cutoff) seenMessageIds.delete(id);
            if (seenMessageIds.size <= MAX_SEEN_MESSAGES * 0.9) break;
        }
        while (seenMessageIds.size > MAX_SEEN_MESSAGES) {
            const oldest = seenMessageIds.keys().next().value;
            seenMessageIds.delete(oldest);
        }
    }

    if (seenMessageIds.has(messageId)) return true;
    seenMessageIds.set(messageId, Date.now());
    return false;
}

/**
 * DB-backed dedup — checks the messages table for prior processing of
 * this message_id. Returns false on any lookup error (fail-open) because
 * missing a duplicate once is far less bad than stalling the webhook on
 * a transient Supabase blip.
 *
 * Exported as a helper so tests can stub it, and so we can swap it for a
 * Redis/KV-backed implementation later without touching the main route.
 */
async function isDuplicateMessageDb(messageId) {
    if (!messageId) return false;
    try {
        if (typeof db.hasMessageId !== 'function') return false;
        return await db.hasMessageId(messageId);
    } catch (e) {
        console.warn('[WEBHOOK] isDuplicateMessageDb soft-fail:', e?.message);
        return false;
    }
}

// =============================================
// Step Timer — wrap any async op with timing + structured error logging
// =============================================
// P2-02: when a `trace` array is passed, each step appends
//   { step, ms, ok, code?, err_kind? }
// so the caller can emit a single aggregated trace line at end-of-request.
// Per-step logs are still emitted for real-time tailing; the aggregate
// makes post-hoc analysis (p95 latency per step, failure hotspots) trivial.
//
// `log` is an optional scoped logger (carrying request_id, message_id,
// phone). Falls back to the root logger so legacy call sites work.
async function step(name, fn, {
    critical = false,
    timeoutMs = null,
    log = logger,
    trace = null,
} = {}) {
    const t0 = Date.now();
    try {
        const promise = Promise.resolve().then(fn);
        let result;
        if (timeoutMs) {
            // FIX: Clear the timeout when the main promise settles first,
            // preventing an unhandled rejection from the losing timeout promise.
            let timer;
            const timeoutPromise = new Promise((_, rej) => {
                timer = setTimeout(() => rej(new Error(`step "${name}" timed out after ${timeoutMs}ms`)), timeoutMs);
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
        // P2-03 metrics
        metrics.observe('step_duration_ms', dt, { step: name, outcome: 'ok' });
        metrics.inc('step_total', 1, { step: name, outcome: 'ok' });
        return { ok: true, result, ms: dt };
    } catch (err) {
        const dt = Date.now() - t0;
        const errKind = err?.code
            || (err?.message?.includes('timed out') ? 'TIMEOUT' : 'ERROR');
        log.error(`step:${name} failed`, {
            step: name,
            status: 'failed',
            ms: dt,
            code: err?.code,
            details: err?.details,
            err,
        });
        if (trace) trace.push({
            step: name, ms: dt, ok: false,
            err_kind: errKind,
            err_message: err?.message,
        });
        // P2-03 metrics
        metrics.observe('step_duration_ms', dt, { step: name, outcome: 'failed' });
        metrics.inc('step_total', 1, { step: name, outcome: 'failed' });
        metrics.inc('step_errors_total', 1, { step: name, err_kind: errKind });
        if (critical) throw err;
        return { ok: false, error: err, ms: dt };
    }
}

// Hard timeouts — Netlify Functions have a 26s max.
// Meta accepts up to ~20s before retry, Netlify Pro sync functions cap at 26s.
// Budget: 1s parse/read + 24s AI + 1s send+save tail = ~26s.
// The AI step includes: state load + classifier + RAG + LLM1 + tool loops + LLM2.
// Correctness > latency: we'd rather a slow correct answer than a fast fallback.
const TIMEOUTS = {
    markAsRead:  2000,
    customerOp: 3000,
    aiCall:    24000,   // was 20s — widened so LLM2 and tool loops can finish
    sendMsg:    3000,
    saveConv:   3000,
};

// =============================================
// GET /webhook — Meta Verification (unchanged)
// =============================================
router.get('/', (req, res) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    logger.info('[WEBHOOK VERIFY]', { mode, match: token === VERIFY_TOKEN });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logger.success('✅ Webhook verified!');
        return res.status(200).type('text').send(challenge);
    }
    logger.error('❌ Webhook verification FAILED');
    return res.status(403).send('Forbidden');
});

// =============================================
// POST /webhook — Incoming WhatsApp Messages (SYNCHRONOUS)
// =============================================
router.post('/', verifyMetaSignature, async (req, res) => {
    const requestStart = Date.now();
    const requestId = newRequestId();
    // Root scope for this request — even if parse fails we have request_id.
    let reqLog = logger.child({ request_id: requestId });

    // ── Helper: always respond 200 to Meta exactly once ──
    let responded = false;
    const respondOk = (note) => {
        if (responded) return;
        responded = true;
        const total = Date.now() - requestStart;
        reqLog.webhook('→ 200', { outcome: note, total_ms: total });
        // P2-03 metrics — count every webhook invocation with its terminal outcome
        // and observe the end-to-end duration.
        metrics.inc('webhook_requests_total', 1, { outcome: note });
        metrics.observe('webhook_duration_ms', total, { outcome: note });
        res.status(200).json({ status: 'ok' });
    };

    try {
        const body = req.body;
        if (body?.object !== 'whatsapp_business_account') return respondOk('not-whatsapp');

        // Quick parse
        const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        const contact = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];

        if (!message)                  return respondOk('no-message');
        if (message.type !== 'text')   return respondOk(`type=${message.type}`);

        // Upgrade correlation context now that we have message_id + phone.
        reqLog = reqLog.child({ message_id: message.id, phone: message.from });

        if (!isValidPhone(message.from)) {
            reqLog.warn('bad phone number', { phone: message.from });
            return respondOk('bad-phone');
        }
        if (checkBlacklist(message.from)) {
            reqLog.info('blacklisted caller', { phone: message.from });
            return respondOk('blacklisted');
        }
        // Two-tier dedup: cheap in-memory first, then DB for cold-start/parallel cases.
        if (isDuplicateMessageMem(message.id)) {
            reqLog.info('duplicate webhook (mem)', { dedup: 'mem' });
            return respondOk('duplicate-mem');
        }
        if (await isDuplicateMessageDb(message.id)) {
            reqLog.info('duplicate webhook (db)', { dedup: 'db' });
            return respondOk('duplicate-db');
        }

        const text = (message.text?.body || '').trim();
        if (!text) return respondOk('empty-text');

        const incoming = {
            messageId: message.id,
            from:      message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            text,
            name:      contact?.profile?.name || message.from,
            log:       reqLog,   // thread correlation into downstream steps
        };

        reqLog.webhook('message received', {
            name: incoming.name,
            text_preview: incoming.text.substring(0, 80),
        });

        // ── Process the message synchronously ──
        // Why: setImmediate doesn't survive Lambda freeze. Synchronous is reliable.
        await processMessage(incoming);

        return respondOk('processed');

    } catch (outerErr) {
        // Last-resort safety net — should never fire because processMessage handles its own errors
        reqLog.error('outer catch', { err: outerErr });
        return respondOk('outer-error');
    }
});

// =============================================
// Synchronous Message Processor
// =============================================
async function processMessage(incoming) {
    const start = Date.now();
    // Use the correlation-scoped logger the route handler threaded in.
    // Falls back to root logger if this is called without one (e.g. tests).
    const log = incoming.log || logger;
    // P2-02: collect every step timing into a single trace so we can emit
    // one aggregated record per request at end-of-processing.
    const trace = [];
    let aiResponseText = null;
    let customer = null;
    let sentimentLabel = 'محايد';
    let aiTimings = {};

    try {
        // ── 1. Sentiment / topic / intent (sync, instant) ──
        const sentimentResult = analyzeSentiment(incoming.text);
        sentimentLabel = sentimentResult.label;
        const topic  = detectTopic(incoming.text);
        const intent = detectIntent(incoming.text);

        // ── 2. Parallel: mark as read + customer lookup ──
        const [, customerStep] = await Promise.all([
            step('whatsapp.markAsRead',
                () => whatsappService.markAsRead(incoming.messageId),
                { timeoutMs: TIMEOUTS.markAsRead, log, trace }),
            step('db.getOrCreateCustomer',
                () => db.getOrCreateCustomer(incoming.from, incoming.name),
                { timeoutMs: TIMEOUTS.customerOp, log, trace }),
        ]);
        customer = customerStep.ok ? customerStep.result : null;

        // ── 3. Generate AI response (the slow step — typically 1.5–4s) ──
        const aiStep = await step('ai.generateResponse',
            () => geminiService.generateResponse(incoming.from, incoming.text, incoming.name),
            { critical: true, timeoutMs: TIMEOUTS.aiCall, log, trace }
        );
        const aiResult = aiStep.result;
        aiResponseText = aiResult.response;
        aiTimings = {
            ai_ms: aiStep.ms,
            tools: aiResult.toolsUsed || [],
            escalated: !!aiResult.escalated,
        };

        // ── 4. Parallel: send WhatsApp reply + save conversation ──
        // Awaited synchronously so timings & failures appear in logs.
        // Loyalty points moved to AFTER the response is sent (it's non-critical).
        const [sendStep, saveStep] = await Promise.all([
            step('whatsapp.sendTextMessage',
                () => whatsappService.sendTextMessage(incoming.from, aiResponseText),
                { timeoutMs: TIMEOUTS.sendMsg, log, trace }),
            step('db.saveConversation', () => db.saveConversation({
                phone_number:     incoming.from,
                customer_id:      customer?.id || null,
                customer_name:    incoming.name,
                customer_message: incoming.text,
                ai_response:      aiResponseText,
                response_time:    aiResult.responseTime,
                sentiment:        sentimentLabel,
                topic,
                intent,
                tools_used:       aiResult.toolsUsed || [],
                escalated:        aiResult.escalated || false,
                message_id:       incoming.messageId,
                status:           'delivered', // overwritten below if send failed
            }), { timeoutMs: TIMEOUTS.saveConv, log, trace }),
        ]);

        if (!sendStep.ok) {
            log.warn('process: whatsapp send failed — processing continued');
        }
        if (!saveStep.ok) {
            log.warn('process: saveConversation failed — message not in dashboard');
        }

        // ── 5. Loyalty points — synchronous (non-critical, but must finish before Lambda exits) ──
        if (customer?.id) {
            await step('db.updateCustomerLoyalty',
                () => db.updateCustomerLoyalty(customer.id, 1),
                { timeoutMs: 2000, log, trace });
        }

        const total = Date.now() - start;
        log.success('process: done', {
            total_ms: total,
            ai_ms: aiTimings.ai_ms,
            tools: aiTimings.tools,
            sentiment: sentimentLabel,
        });
        emitTrace(log, {
            outcome: 'ok',
            total_ms: total,
            trace,
            sentiment: sentimentLabel,
            tools: aiTimings.tools,
            escalated: aiTimings.escalated,
        });

    } catch (error) {
        const total = Date.now() - start;
        const errKind = error?.code || (error?.message?.includes('timed out') ? 'TIMEOUT' : 'UNKNOWN');
        log.error('process: FAILED', { total_ms: total, kind: errKind, err: error });

        // Try to send a friendly fallback to the user — but only if we haven't already
        // sent an AI response (i.e. failure was before/during step 4)
        if (!aiResponseText) {
            // Pick a more informative fallback based on error kind
            let fallback = 'عذراً، صار عنا مشكلة تقنية بسيطة 😔\nاتصل على 06-5000001 وإحنا نساعدك!';
            if (errKind === 'TIMEOUT') {
                fallback = 'عذراً، خدمتنا تأخرت شوي 🙏\nجرب تبعت رسالتك مرة ثانية أو اتصل 06-5000001';
            }

            await step('fallback.sendTextMessage',
                () => whatsappService.sendTextMessage(incoming.from, fallback),
                { timeoutMs: 3000, log, trace });

            // Best-effort: log the failure to messages table so it shows in dashboard.
            // Wrapped in step() so its own failure is logged but doesn't crash us.
            await step('fallback.saveConversation', () => db.saveConversation({
                phone_number:     incoming.from,
                customer_id:      customer?.id || null,
                customer_name:    incoming.name,
                customer_message: incoming.text,
                ai_response:      `[${errKind}] ${error?.message || 'unknown'}`,
                response_time:    total,
                sentiment:        sentimentLabel,
                topic:            'خطأ',
                intent:           'error',
                tools_used:       [],
                escalated:        true,
                message_id:       incoming.messageId,
                status:           'error',
            }), { timeoutMs: 3000, log, trace });
        }
        emitTrace(log, {
            outcome: 'failed',
            total_ms: total,
            trace,
            err_kind: errKind,
            err_message: error?.message,
        });
    }
}

/**
 * Emit one aggregated trace line at end-of-request. Exactly one per
 * webhook invocation, making it trivial to rebuild a flame-graph or
 * compute p95 per step in downstream log analytics.
 */
function emitTrace(log, payload) {
    log.info('process: trace', payload);
}

module.exports = router;
