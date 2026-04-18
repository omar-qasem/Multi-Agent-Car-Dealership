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

module.exports = router;
