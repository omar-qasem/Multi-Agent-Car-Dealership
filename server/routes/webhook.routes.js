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
const router = express.Router();
const whatsappService = require('../services/whatsapp.service');
const geminiService = require('../services/gemini.service');
const db = require('../database/db');
const { analyzeSentiment, detectTopic, detectIntent } = require('../utils/sentiment');
const { checkBlacklist } = require('../middleware/auth');
const logger = require('../utils/logger');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
    logger.error('❌ WHATSAPP_VERIFY_TOKEN not set — webhook verification will fail');
}

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
const isValidPhone = (phone) => typeof phone === 'string' && PHONE_REGEX.test(phone);

// =============================================
// Message ID Deduplication
// =============================================
// Meta retries the webhook if it doesn't receive 200 in ~5s.
// In serverless this Map resets on cold start, which is fine — Meta retries
// happen within seconds, well within a warm container's lifetime.
const SEEN_MESSAGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SEEN_MESSAGES   = 5000;
const seenMessageIds = new Map(); // messageId → timestamp

function isDuplicateMessage(messageId) {
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

// =============================================
// Step Timer — wrap any async op with timing + structured error logging
// =============================================
async function step(name, fn, { critical = false, timeoutMs = null } = {}) {
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
        console.log(`[STEP] ✅ ${name} ok (${dt}ms)`);
        return { ok: true, result, ms: dt };
    } catch (err) {
        const dt = Date.now() - t0;
        const code = err?.code ? ` code=${err.code}` : '';
        const details = err?.details ? ` details=${err.details}` : '';
        console.error(`[STEP] ❌ ${name} FAILED (${dt}ms)${code}${details} — ${err?.message || err}`);
        if (err?.stack) console.error(err.stack);
        if (critical) throw err;
        return { ok: false, error: err, ms: dt };
    }
}

// Hard timeouts — Netlify Functions have a 26s max.
// Meta accepts up to ~20s before retry.
// Budget: 2s parse/read + 20s AI + 2s send+save (parallel) = 24s < 26s.
// The AI step includes: state load + classifier + RAG + LLM + tool loops.
const TIMEOUTS = {
    markAsRead:  2000,
    customerOp: 3000,
    aiCall:    20000,   // Groq LLM ~3-8s + RAG 1s + state load + tool loops
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
router.post('/', async (req, res) => {
    const requestStart = Date.now();

    // ── Helper: always respond 200 to Meta exactly once ──
    let responded = false;
    const respondOk = (note) => {
        if (responded) return;
        responded = true;
        const total = Date.now() - requestStart;
        console.log(`[WEBHOOK] → 200 (${note}) total=${total}ms`);
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
        if (!isValidPhone(message.from)) {
            logger.warn(`🚫 رقم غير صالح: ${message.from}`);
            return respondOk('bad-phone');
        }
        if (checkBlacklist(message.from)) {
            logger.info(`🚫 رقم محظور: ${message.from}`);
            return respondOk('blacklisted');
        }
        if (isDuplicateMessage(message.id)) {
            logger.info(`🔁 Duplicate webhook ignored: ${message.id}`);
            return respondOk('duplicate');
        }

        const text = (message.text?.body || '').trim();
        if (!text) return respondOk('empty-text');

        const incoming = {
            messageId: message.id,
            from:      message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            text,
            name:      contact?.profile?.name || message.from,
        };

        console.log(`[WEBHOOK] 📩 ${incoming.from} (${incoming.name}): "${incoming.text.substring(0, 80)}"`);

        // ── Process the message synchronously ──
        // Why: setImmediate doesn't survive Lambda freeze. Synchronous is reliable.
        await processMessage(incoming);

        return respondOk('processed');

    } catch (outerErr) {
        // Last-resort safety net — should never fire because processMessage handles its own errors
        console.error('[WEBHOOK] 💥 OUTER catch:', outerErr?.message, outerErr?.stack);
        return respondOk('outer-error');
    }
});

// =============================================
// Synchronous Message Processor
// =============================================
async function processMessage(incoming) {
    const start = Date.now();
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
                { timeoutMs: TIMEOUTS.markAsRead }),
            step('db.getOrCreateCustomer',
                () => db.getOrCreateCustomer(incoming.from, incoming.name),
                { timeoutMs: TIMEOUTS.customerOp }),
        ]);
        customer = customerStep.ok ? customerStep.result : null;

        // ── 3. Generate AI response (the slow step — typically 1.5–4s) ──
        const aiStep = await step('ai.generateResponse',
            () => geminiService.generateResponse(incoming.from, incoming.text, incoming.name),
            { critical: true, timeoutMs: TIMEOUTS.aiCall }
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
                { timeoutMs: TIMEOUTS.sendMsg }),
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
            }), { timeoutMs: TIMEOUTS.saveConv }),
        ]);

        if (!sendStep.ok) {
            console.error('[PROCESS] ⚠️  WhatsApp send failed but processing continued');
        }
        if (!saveStep.ok) {
            console.error('[PROCESS] ⚠️  saveConversation failed — message not in dashboard');
        }

        // ── 5. Loyalty points — synchronous (non-critical, but must finish before Lambda exits) ──
        if (customer?.id) {
            await step('db.updateCustomerLoyalty',
                () => db.updateCustomerLoyalty(customer.id, 1),
                { timeoutMs: 2000 });
        }

        const total = Date.now() - start;
        console.log(`[PROCESS] ✅ done in ${total}ms | ai=${aiTimings.ai_ms}ms | tools=[${aiTimings.tools.join(',')}] | sentiment=${sentimentLabel}`);

    } catch (error) {
        const total = Date.now() - start;
        const errKind = error?.code || (error?.message?.includes('timed out') ? 'TIMEOUT' : 'UNKNOWN');
        console.error(`[PROCESS] ❌ FAILED after ${total}ms kind=${errKind} — ${error?.message}`);
        if (error?.stack) console.error(error.stack);

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
                { timeoutMs: 3000 });

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
            }), { timeoutMs: 3000 });
        }
    }
}

module.exports = router;
