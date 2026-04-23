/**
 * Netlify Background Function — AI Pipeline (unlimited time)
 *
 * ────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS
 * ────────────────────────────────────────────────────────────────
 *  Netlify Pro SYNC functions cap at 26 seconds. Our `/webhook` handler
 *  used to run the full pipeline (classifier → RAG → LLM1 → tools →
 *  LLM2) synchronously, which repeatedly burst past that ceiling on
 *  complex Arabic purchase queries — the LLM2 call alone regularly
 *  takes 10–15 seconds on llama-3.1-8b-instant when the context
 *  contains multiple tool results + 11 tool schemas.
 *
 *  Background Functions (filename ending `-background.js`) get a
 *  15-MINUTE execution cap instead. That's effectively unlimited for
 *  a single customer message, which is exactly what the user asked
 *  for: "خليه مفتوح بدون قيود عالوقت" (keep it open, no time limits).
 *
 *  FLOW:
 *   1. `/webhook` receives a WhatsApp POST from Meta
 *   2. It deduplicates, parses, and IMMEDIATELY returns 200 to Meta
 *      so Meta doesn't retry (Meta's 20s grace is plenty)
 *   3. It fires a POST to `/.netlify/functions/process-ai-background`
 *      which Netlify acknowledges with 202 Accepted in ~100 ms
 *   4. This file then runs the full pipeline at its own pace (up to
 *      15 minutes), sends the WhatsApp reply, and saves the record
 *
 *  This function is invoked over HTTP — Netlify handles the auth
 *  surface (same-origin) and returns 202 immediately on POST.
 * ────────────────────────────────────────────────────────────────
 */

process.env.NETLIFY = 'true';

const logger = require('../../server/utils/logger');
const whatsappService = require('../../server/services/whatsapp.service');
const geminiService = require('../../server/services/gemini.service');
const db = require('../../server/database/db');
const { analyzeSentiment, detectTopic, detectIntent } = require('../../server/utils/sentiment');
const { step } = require('../../server/utils/shared-steps');

// -----------------------------------------------------------------
// Background function handler
// -----------------------------------------------------------------
// Netlify routes all POSTs to /.netlify/functions/process-ai-background
// to this handler. We accept JSON with the parsed WhatsApp payload so
// the background path doesn't have to re-verify Meta's HMAC (the sync
// `/webhook` function already did that before enqueueing).
exports.handler = async (event) => {
    const start = Date.now();

    // Netlify Background Functions MUST return 202 Accepted. We still
    // do the work before returning — the 202 goes back to the internal
    // invoker (our own /webhook function), which has already responded
    // 200 to Meta and therefore doesn't care about this reply.
    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch {
        logger.error('bg: malformed JSON body');
        return { statusCode: 400, body: 'bad json' };
    }

    const {
        messageId, from, text, name, timestamp, requestId,
    } = payload;

    if (!from || !text) {
        logger.error('bg: missing required fields', { has_from: !!from, has_text: !!text });
        return { statusCode: 400, body: 'missing fields' };
    }

    const log = logger.child({
        request_id: requestId || 'bg-direct',
        message_id: messageId,
        phone: from,
        path: 'background',
    });

    log.info('bg: message received', {
        name,
        text_preview: (text || '').substring(0, 80),
    });

    // Send typing indicator immediately so the customer sees "..." while AI processes.
    // Fire-and-forget — a failure here must never block the pipeline.
    whatsappService.sendTypingIndicator(from).catch(e =>
        log.warn('bg: typingIndicator soft-fail', { err: e?.message })
    );

    const trace = [];
    let aiResponseText = null;
    let customer = null;
    let sentimentLabel = 'محايد';
    let aiTimings = {};

    try {
        // ── 1. Sentiment / topic / intent (sync, instant) ──
        const sentimentResult = analyzeSentiment(text);
        sentimentLabel = sentimentResult.label;
        const topic  = detectTopic(text);
        const intent = detectIntent(text);

        // ── 2. Customer lookup. markAsRead was already fired from the
        //       sync handler so Meta sees the typing indicator ASAP.
        const customerStep = await step('bg.db.getOrCreateCustomer',
            () => db.getOrCreateCustomer(from, name),
            { timeoutMs: 5000, log, trace });
        customer = customerStep.ok ? customerStep.result : null;

        // ── 3. AI — unlimited mode. Retry once on failure before giving up.
        let aiStep = await step('bg.ai.generateResponse',
            () => geminiService.generateResponse(from, text, name, { unlimited: true }),
            { log, trace }
        );

        if (!aiStep.ok) {
            log.warn('bg: AI first attempt failed — retrying in 2s', { err: aiStep.error?.message });
            await new Promise(r => setTimeout(r, 2000));
            aiStep = await step('bg.ai.generateResponse.retry',
                () => geminiService.generateResponse(from, text, name, { unlimited: true }),
                { log, trace }
            );
        }

        if (!aiStep.ok) {
            // Both attempts failed — fall through to outer catch for dead-letter + alert.
            throw aiStep.error || new Error('generateResponse failed after retry');
        }

        const aiResult = aiStep.result;
        aiResponseText = aiResult.response;
        aiTimings = {
            ai_ms: aiStep.ms,
            tools: aiResult.toolsUsed || [],
            escalated: !!aiResult.escalated,
        };

        // ── 4. Parallel: send + save (each with its own 10s ceiling) ──
        const [sendStep, saveStep] = await Promise.all([
            step('bg.whatsapp.sendTextMessage',
                () => whatsappService.sendTextMessage(from, aiResponseText),
                { timeoutMs: 10000, log, trace }),
            step('bg.db.saveConversation', () => db.saveConversation({
                phone_number:     from,
                customer_id:      customer?.id || null,
                customer_name:    name,
                customer_message: text,
                ai_response:      aiResponseText,
                response_time:    aiResult.responseTime,
                sentiment:        sentimentLabel,
                topic,
                intent,
                tools_used:       aiResult.toolsUsed || [],
                escalated:        aiResult.escalated || false,
                message_id:       messageId,
                status:           'delivered',
            }), { timeoutMs: 10000, log, trace }),
        ]);

        if (!sendStep.ok) log.warn('bg: whatsapp send failed');
        if (!saveStep.ok) log.warn('bg: saveConversation failed');

        // ── 5. Loyalty points (non-critical) ──
        if (customer?.id) {
            await step('bg.db.updateCustomerLoyalty',
                () => db.updateCustomerLoyalty(customer.id, 1),
                { timeoutMs: 5000, log, trace });
        }

        const total = Date.now() - start;
        log.success('bg: done', {
            total_ms: total,
            ai_ms: aiTimings.ai_ms,
            tools: aiTimings.tools,
            sentiment: sentimentLabel,
        });
        log.info('bg: trace', {
            outcome: 'ok',
            total_ms: total,
            trace,
            sentiment: sentimentLabel,
            tools: aiTimings.tools,
            escalated: aiTimings.escalated,
        });

        // 202 is the correct return code for a Netlify Background Function
        return { statusCode: 202, body: JSON.stringify({ status: 'ok', total_ms: total }) };

    } catch (error) {
        const total = Date.now() - start;
        const errKind = error?.code || (error?.message?.includes('timed out') ? 'TIMEOUT' : 'UNKNOWN');
        log.error('bg: FAILED', { total_ms: total, kind: errKind, err: error });

        if (!aiResponseText) {
            const fallback = errKind === 'TIMEOUT'
                ? 'عذراً، خدمتنا تأخرت شوي 🙏\nجرب تبعت رسالتك مرة ثانية أو اتصل 06-5000001'
                : 'عذراً، صار عنا مشكلة تقنية بسيطة 😔\nاتصل على 06-5000001 وإحنا نساعدك!';

            await step('bg.fallback.sendTextMessage',
                () => whatsappService.sendTextMessage(from, fallback),
                { timeoutMs: 5000, log, trace });

            await step('bg.fallback.saveConversation', () => db.saveConversation({
                phone_number:     from,
                customer_id:      customer?.id || null,
                customer_name:    name,
                customer_message: text,
                ai_response:      `[${errKind}] ${error?.message || 'unknown'}`,
                response_time:    total,
                sentiment:        sentimentLabel,
                topic:            'خطأ',
                intent:           'error',
                tools_used:       [],
                escalated:        true,
                message_id:       messageId,
                status:           'error',
            }), { timeoutMs: 5000, log, trace });
        }

        log.info('bg: trace', {
            outcome: 'failed',
            total_ms: total,
            trace,
            err_kind: errKind,
            err_message: error?.message,
        });

        // Dead-letter save — persist the failed message for manual review.
        if (typeof db.saveFailedMessage === 'function') {
            db.saveFailedMessage({
                message_id:       messageId,
                phone_number:     from,
                customer_message: text,
                error_kind:       errKind,
                error_message:    error?.message,
            }).catch(() => {});
        }

        // Alert admin if 3+ failures in the last 5 minutes (9.4).
        if (typeof db.countRecentFailedMessages === 'function' && process.env.STAFF_NOTIFICATION_PHONE) {
            db.countRecentFailedMessages(5).then(count => {
                if (count >= 3) {
                    const alertMsg = `⚠️ تنبيه نظام: ${count} رسائل فاشلة في آخر 5 دقائق — راجع اللوقات والـ dashboard`;
                    whatsappService.sendTextMessage(process.env.STAFF_NOTIFICATION_PHONE, alertMsg)
                        .catch(() => {});
                    log.warn('bg: admin alert sent — high failure rate', { count });
                }
            }).catch(() => {});
        }

        return { statusCode: 202, body: JSON.stringify({ status: 'error', kind: errKind }) };
    }
};
