/**
 * أوتو جوردن - Webhook Routes (Speed-Optimised)
 *
 * Flow:
 *   1. Parse & validate incoming message  ← sync, <1ms
 *   2. Return HTTP 200 to Meta immediately ← before ANY async work
 *   3. Fire-and-forget processMessage()   ← runs in background via setImmediate
 *
 * Why setImmediate?
 *   Express/Node won't close the TCP connection just because res.json() was called.
 *   setImmediate defers processing until after the current I/O cycle so the HTTP
 *   response is flushed before we start the heavy AI work.  Netlify Lambda keeps
 *   the function alive until the JS event loop is empty, so background work completes.
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
// GET /webhook — Meta Webhook Verification
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
// POST /webhook — Incoming WhatsApp Messages
// =============================================
router.post('/', (req, res) => {
    // ── Step 1: Respond 200 to Meta immediately (sync, no await) ──
    res.status(200).json({ status: 'ok' });

    const body = req.body;
    if (body?.object !== 'whatsapp_business_account') return;

    // ── Step 2: Quick parse (sync) ─────────────────────────────────
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];

    if (!message || message.type !== 'text') return;
    if (!isValidPhone(message.from)) {
        logger.warn(`🚫 رقم غير صالح: ${message.from}`);
        return;
    }
    if (checkBlacklist(message.from)) {
        logger.info(`🚫 رقم محظور: ${message.from}`);
        return;
    }

    const incoming = {
        messageId: message.id,
        from:      message.from,
        timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        text:      message.text?.body || '',
        name:      contact?.profile?.name || message.from,
    };

    logger.webhook('📩 رسالة واردة', {
        from: incoming.from,
        name: incoming.name,
        text: incoming.text.substring(0, 60),
    });

    // ── Step 3: Fire-and-forget background processing ──────────────
    // setImmediate defers until AFTER the HTTP response is flushed
    setImmediate(() => {
        processMessage(incoming).catch(err =>
            logger.error('❌ Background processMessage error:', err.message)
        );
    });
});

// =============================================
// Background Message Processor
// =============================================
async function processMessage(incoming) {
    const start = Date.now();

    try {
        // Run sentiment analysis + mark-as-read + customer lookup IN PARALLEL
        const [sentimentResult, , customer] = await Promise.all([
            Promise.resolve(analyzeSentiment(incoming.text)),                 // sync wrapped for consistency
            whatsappService.markAsRead(incoming.messageId)
                .catch(e => logger.warn('markAsRead failed:', e.message)),    // non-critical
            db.getOrCreateCustomer(incoming.from, incoming.name),
        ]);

        const topic  = detectTopic(incoming.text);   // sync
        const intent = detectIntent(incoming.text);  // sync

        // Generate AI response (the slow part)
        const aiResult = await geminiService.generateResponse(
            incoming.from,
            incoming.text,
            incoming.name
        );

        // Send WhatsApp reply + save to DB IN PARALLEL (no dependency between them)
        await Promise.all([
            whatsappService.sendTextMessage(incoming.from, aiResult.response),
            db.saveConversation({
                phone_number:     incoming.from,
                customer_id:      customer?.id || null,
                customer_name:    incoming.name,
                customer_message: incoming.text,
                ai_response:      aiResult.response,
                response_time:    aiResult.responseTime,
                sentiment:        sentimentResult.label,
                topic,
                intent,
                tools_used:       aiResult.toolsUsed || [],
                escalated:        aiResult.escalated || false,
                message_id:       incoming.messageId,
                status:           'delivered',
            }),
        ]);

        // Loyalty points — fire-and-forget (non-critical)
        if (customer?.id) {
            db.updateCustomerLoyalty(customer.id, 1)
                .catch(e => logger.warn('updateCustomerLoyalty failed:', e.message));
        }

        logger.success(`✅ معالجة كاملة ${Date.now() - start}ms`, {
            from:      incoming.from,
            topic,
            intent,
            sentiment: sentimentResult.label,
            tools:     aiResult.toolsUsed?.join(', ') || 'none',
        });

    } catch (error) {
        logger.error('❌ خطأ في معالجة الرسالة:', error.message);

        // Try to send error message to user
        try {
            await whatsappService.sendTextMessage(
                incoming.from,
                'عذراً، صار عنا مشكلة تقنية بسيطة 😔\nاتصل على 06-5000001 وإحنا نساعدك!'
            );
        } catch { /* ignore send errors during failure path */ }
    }
}

module.exports = router;
