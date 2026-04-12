/**
 * أوتو جوردن - Conversations Routes
 * محادثات العملاء + إرسال يدوي + القائمة السوداء
 * All handlers are async — db calls return Promises
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const whatsappService = require('../services/whatsapp.service');
const { authenticateToken, addToBlacklist, removeFromBlacklist, getBlacklist } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Validate international phone number format (E.164-like)
 * Allows 7-15 digits, optional leading +
 */
const PHONE_REGEX = /^\+?\d{7,15}$/;
function isValidPhone(phone) {
    return typeof phone === 'string' && PHONE_REGEX.test(phone.trim());
}

/**
 * GET /api/conversations - كل المحادثات مجمعة
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { phone, topic, limit = 50 } = req.query;

        if (phone) {
            const convs = await db.getConversationsByPhone(phone);
            return res.json({ success: true, count: convs.length, data: convs });
        }

        const grouped = await db.getGroupedConversations(parseInt(limit));

        let result = grouped;
        if (topic) {
            result = grouped.filter(g =>
                g.messages.some(m => m.topic === topic)
            );
        }

        res.json({ success: true, count: result.length, data: result });
    } catch (error) {
        logger.error('❌ خطأ في جلب المحادثات:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب المحادثات' });
    }
});

/**
 * POST /api/conversations/send - إرسال رسالة يدوية
 */
router.post('/send', authenticateToken, async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ success: false, message: 'رقم الهاتف والرسالة مطلوبان' });
        }
        if (!isValidPhone(to)) {
            return res.status(400).json({ success: false, message: 'صيغة رقم الهاتف غير صحيحة — يجب 7-15 رقم بصيغة دولية' });
        }
        if (message.length > 4096) {
            return res.status(400).json({ success: false, message: 'الرسالة طويلة جداً — الحد الأقصى 4096 حرف' });
        }

        const result = await whatsappService.sendTextMessage(to.trim(), message);

        await db.saveConversation({
            phone_number: to,
            customer_name: 'رسالة يدوية',
            customer_message: '[رسالة يدوية من الداشبورد]',
            ai_response: message,
            response_time: result.responseTime,
            sentiment: 'محايد',
            topic: 'رسالة يدوية',
            escalated: false,
            message_id: result.messageId,
            status: 'sent',
        });

        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        logger.error('❌ خطأ في إرسال الرسالة:', error);
        res.status(500).json({ success: false, message: 'فشل في إرسال الرسالة' });
    }
});

/**
 * GET /api/conversations/:phone - محادثة رقم معين
 */
router.get('/:phone', authenticateToken, async (req, res) => {
    try {
        const messages = await db.getConversationsByPhone(req.params.phone);
        if (messages.length === 0) {
            return res.status(404).json({ success: false, message: 'لا توجد محادثات لهذا الرقم' });
        }
        res.json({ success: true, phoneNumber: req.params.phone, count: messages.length, messages });
    } catch (error) {
        logger.error('❌ خطأ في جلب محادثات الرقم:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب المحادثات' });
    }
});

/**
 * POST /api/conversations/blacklist - حظر رقم
 */
router.post('/blacklist', authenticateToken, (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
    if (!isValidPhone(phoneNumber)) return res.status(400).json({ success: false, message: 'صيغة رقم الهاتف غير صحيحة' });
    addToBlacklist(phoneNumber.trim());
    res.json({ success: true, message: `تم حظر الرقم ${phoneNumber}` });
});

/**
 * DELETE /api/conversations/blacklist/:phone - رفع الحظر
 */
router.delete('/blacklist/:phone', authenticateToken, (req, res) => {
    removeFromBlacklist(req.params.phone);
    res.json({ success: true, message: 'تم رفع الحظر' });
});

/**
 * GET /api/conversations/blacklist/list - قائمة المحظورين
 */
router.get('/blacklist/list', authenticateToken, (req, res) => {
    res.json({ success: true, data: getBlacklist() });
});

module.exports = router;
