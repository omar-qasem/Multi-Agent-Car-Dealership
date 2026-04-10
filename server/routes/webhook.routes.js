/**
 * أوتو جوردن - Webhook Routes
 * استقبال رسائل واتساب ومعالجتها مع الوكيل الذكي
 * All db calls are await'd — data persists to Supabase
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

// E.164 phone number format validation
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
const isValidPhone = (phone) => typeof phone === 'string' && PHONE_REGEX.test(phone);

/**
 * GET /webhook - التحقق من الـ Webhook
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[WEBHOOK VERIFY]', { mode, token, expectedToken: VERIFY_TOKEN, match: token === VERIFY_TOKEN });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(challenge);
    }

    console.log('❌ Webhook verification FAILED');
    return res.status(403).send('Forbidden');
});

/**
 * POST /webhook - استقبال الرسائل الواردة
 */
router.post('/', async (req, res) => {
    // Always respond 200 immediately so Meta doesn't retry
    res.status(200).json({ status: 'ok' });

    const body = req.body;
    if (body?.object !== 'whatsapp_business_account') return;

    try {
        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value?.messages) return;

        const message = value.messages[0];
        const contact = value.contacts?.[0];

        if (message.type !== 'text') return;

        // Phone number validation (E.164)
        if (!isValidPhone(message.from)) {
            logger.warn(`🚫 رقم هاتف بصيغة غير صالحة: ${message.from}`);
            return;
        }

        const incomingMessage = {
            messageId: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            text: message.text?.body || '',
            name: contact?.profile?.name || message.from,
        };

        logger.webhook('📩 رسالة واردة', {
            from: incomingMessage.from,
            name: incomingMessage.name,
            text: incomingMessage.text.substring(0, 60),
        });

        // التحقق من القائمة السوداء
        if (checkBlacklist(incomingMessage.from)) {
            logger.info(`🚫 رقم محظور: ${incomingMessage.from}`);
            return;
        }

        // تحديد حالة القراءة (non-critical)
        whatsappService.markAsRead(incomingMessage.messageId)
            .catch(err => logger.warn('markAsRead failed:', err.message));

        // تحليل المشاعر والموضوع والنية
        const sentimentResult = analyzeSentiment(incomingMessage.text);
        const topic = detectTopic(incomingMessage.text);
        const intent = detectIntent(incomingMessage.text);

        // Get or create customer — await now
        const customer = await db.getOrCreateCustomer(incomingMessage.from, incomingMessage.name);

        // توليد الرد من AI مع الأدوات
        const aiResult = await geminiService.generateResponse(
            incomingMessage.from,
            incomingMessage.text,
            incomingMessage.name
        );

        // إرسال الرد على واتساب
        await whatsappService.sendTextMessage(incomingMessage.from, aiResult.response);

        // تسجيل المحادثة في Supabase — await now
        await db.saveConversation({
            phone_number: incomingMessage.from,
            customer_id: customer ? customer.id : null,
            customer_name: incomingMessage.name,
            customer_message: incomingMessage.text,
            ai_response: aiResult.response,
            response_time: aiResult.responseTime,
            sentiment: sentimentResult.label,
            topic,
            intent,
            tools_used: aiResult.toolsUsed || [],
            escalated: aiResult.escalated || false,
            message_id: incomingMessage.messageId,
            status: 'delivered',
        });

        // Update customer loyalty points (non-critical)
        if (customer) {
            db.updateCustomerLoyalty(customer.id, 1)
                .catch(err => logger.warn('updateCustomerLoyalty failed:', err.message));
        }

        logger.success(`✅ تمت المعالجة (${aiResult.responseTime}ms)`, {
            from: incomingMessage.from,
            topic,
            intent,
            sentiment: sentimentResult.label,
            tools: aiResult.toolsUsed?.join(', ') || 'none',
        });

    } catch (error) {
        logger.error('❌ خطأ في معالجة الرسالة:', error.message);

        try {
            const from = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
            if (from) {
                await whatsappService.sendTextMessage(from, 'عذراً، صار عنا مشكلة تقنية بسيطة 😔\nرح نتواصل معك بأقرب وقت. أو اتصل على 06-5000001');
            }
        } catch {}
    }
});

module.exports = router;
