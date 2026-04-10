/**
 * أوتو جوردن - Analytics Routes
 * التحليلات والإحصائيات
 * All handlers are async — db calls return Promises
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { extractTopWords } = require('../utils/sentiment');
const logger = require('../utils/logger');

/**
 * GET /api/analytics - التحليل الكامل
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { from, to } = req.query;
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [analytics, conversations, todayConvs, weekConvs, dashboardStats] = await Promise.all([
            db.getAnalytics(from, to),
            db.getConversations({ limit: 500, date_from: from, date_to: to }),
            db.getConversations({ date_from: today, limit: 1000 }),
            db.getConversations({ date_from: weekAgo, limit: 5000 }),
            db.getDashboardStats(),
        ]);

        // Word Cloud
        const wordCloud = extractTopWords(conversations.map(c => c.customer_message).filter(Boolean));

        // أكثر الأسئلة تكراراً
        const questionMap = {};
        conversations.forEach(c => {
            if (!c.customer_message) return;
            const q = c.customer_message.trim().substring(0, 60);
            questionMap[q] = (questionMap[q] || 0) + 1;
        });
        const questionFrequency = Object.entries(questionMap)
            .filter(([, count]) => count > 1)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([question, count]) => ({ question, count }));

        // Hourly distribution
        const hourlyDist = {};
        conversations.forEach(c => {
            if (c.created_at) {
                const hour = new Date(c.created_at).getHours();
                hourlyDist[hour] = (hourlyDist[hour] || 0) + 1;
            }
        });
        const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: hourlyDist[i] || 0
        }));

        const todayStats = {
            total: todayConvs.length,
            positive: todayConvs.filter(c => c.sentiment === 'إيجابي').length,
            negative: todayConvs.filter(c => c.sentiment === 'سلبي').length,
            escalated: todayConvs.filter(c => c.escalated).length,
        };

        const weekStats = {
            total: weekConvs.length,
            positive: weekConvs.filter(c => c.sentiment === 'إيجابي').length,
            negative: weekConvs.filter(c => c.sentiment === 'سلبي').length,
            escalated: weekConvs.filter(c => c.escalated).length,
        };

        const escalationRate = analytics.totalMessages > 0
            ? Math.round((analytics.escalatedCount / analytics.totalMessages) * 100)
            : 0;

        const sentimentMap = {};
        (analytics.sentimentCounts || []).forEach(s => { sentimentMap[s.sentiment] = s.count; });

        const sentimentDistribution = [
            { name: 'إيجابي', value: sentimentMap['إيجابي'] || 0 },
            { name: 'محايد', value: sentimentMap['محايد'] || 0 },
            { name: 'سلبي', value: sentimentMap['سلبي'] || 0 },
        ];

        const topicDistribution = (analytics.topicCounts || []).map(t => ({
            name: t.topic,
            value: t.count,
        }));

        res.json({
            success: true,
            data: {
                totalMessages: analytics.totalMessages,
                avgResponseTime: analytics.avgResponseTime,
                uniqueCustomers: analytics.uniqueCustomers,
                escalatedCount: analytics.escalatedCount,
                escalationRate,
                todayStats,
                weekStats,
                dailyMessages: analytics.dailyMessages || [],
                messageTrend: analytics.dailyMessages || [],
                sentimentDistribution,
                topicDistribution,
                hourlyDistribution,
                wordCloud,
                questionFrequency,
                ...dashboardStats,
            },
        });
    } catch (error) {
        logger.error('❌ خطأ في التحليلات:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/analytics/summary - ملخص سريع
 */
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const [stats, analytics] = await Promise.all([
            db.getDashboardStats(),
            db.getAnalytics(),
        ]);
        res.json({
            success: true,
            data: {
                ...stats,
                avgResponseTime: analytics.avgResponseTime,
                escalatedCount: analytics.escalatedCount,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/analytics/export - تصدير CSV
 */
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const convs = await db.getConversations({ limit: 1000 });
        const headers = ['التاريخ', 'رقم الهاتف', 'الاسم', 'رسالة العميل', 'رد الذكاء الاصطناعي', 'وقت الرد', 'المشاعر', 'الموضوع', 'الأدوات', 'مصعد'];
        const rows = convs.map(c => [
            c.created_at,
            c.phone_number,
            c.customer_name || '',
            `"${(c.customer_message || '').replace(/"/g, '""')}"`,
            `"${(c.ai_response || '').replace(/"/g, '""')}"`,
            c.response_time || '',
            c.sentiment || '',
            c.topic || '',
            c.tools_used || '',
            c.escalated ? 'نعم' : 'لا',
        ]);
        const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="autojordan_conversations_${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/analytics/branches
router.get('/branches', authenticateToken, async (req, res) => {
    const branches = await db.getAllBranches();
    res.json({ success: true, data: branches });
});

// GET /api/analytics/cars
router.get('/cars', authenticateToken, async (req, res) => {
    const cars = await db.searchCars(req.query);
    res.json({ success: true, count: cars.length, data: cars });
});

// GET /api/analytics/parts
router.get('/parts', authenticateToken, async (req, res) => {
    const parts = await db.searchParts(req.query);
    res.json({ success: true, count: parts.length, data: parts });
});

// GET /api/analytics/appointments - returns bookings now
router.get('/appointments', authenticateToken, async (req, res) => {
    const bookings = await db.getAllBookings(req.query);
    res.json({ success: true, count: bookings.length, data: bookings });
});

// GET /api/analytics/tickets
router.get('/tickets', authenticateToken, async (req, res) => {
    const tickets = await db.getAllTickets(req.query);
    res.json({ success: true, count: tickets.length, data: tickets });
});

// GET /api/analytics/customers
router.get('/customers', authenticateToken, async (req, res) => {
    const convs = await db.getGroupedConversations(100);
    res.json({ success: true, count: convs.length, data: convs });
});

// GET /api/analytics/promotions
router.get('/promotions', authenticateToken, async (req, res) => {
    const promotions = await db.getActivePromotions();
    res.json({ success: true, count: promotions.length, data: promotions });
});

module.exports = router;
