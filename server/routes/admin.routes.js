/**
 * أوتو جوردن - Admin / Operations Routes (P2-03, P2-04)
 *
 * Exposes in-process metrics and deeper health-checks for on-call
 * visibility. All endpoints are auth-protected — leaking metrics would
 * tell an attacker request rates, error kinds, and internal step names.
 */

const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const metrics = require('../utils/metrics');
const logger  = require('../utils/logger');
const db      = require('../database/db');

/**
 * GET /api/admin/metrics
 * Returns an operator-friendly JSON snapshot of counters, histograms,
 * and gauges collected since this Lambda container warmed up.
 *
 * Note: resets on cold start. For durable long-term metrics, scrape
 * this endpoint from a scheduled job or mirror the snapshot to a
 * metrics sink from inside the Lambda.
 */
router.get('/metrics', authenticateToken, (req, res) => {
    try {
        const snap = metrics.snapshot();
        res.json({ success: true, ...snap });
    } catch (err) {
        logger.error('admin.metrics: snapshot failed', { err });
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/admin/failed-messages
 * List unresolved dead-letter messages for manual review (8.4).
 */
router.get('/failed-messages', authenticateToken, async (req, res) => {
    try {
        const limit    = Math.min(parseInt(req.query.limit) || 50, 200);
        const messages = await db.getFailedMessages(limit);
        res.json({ success: true, messages, count: messages.length });
    } catch (err) {
        logger.error('admin.failed-messages: query failed', { err });
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/admin/failed-messages/:id/resolve
 * Mark a failed message as resolved (admin acknowledges it).
 */
router.post('/failed-messages/:id/resolve', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'invalid id' });
        }
        await db.resolveFailedMessage(id);
        res.json({ success: true, message: `Message ${id} marked as resolved` });
    } catch (err) {
        logger.error('admin.failed-messages.resolve: failed', { err });
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
