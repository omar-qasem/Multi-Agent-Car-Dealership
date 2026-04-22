/**
 * Netlify Scheduled Function — Send Appointment Reminders
 *
 * Runs daily at 15:00 UTC (6 PM Amman time, UTC+3).
 * Configure schedule in netlify.toml or via the Netlify UI.
 *
 * Also accepts manual POST with:
 *   Header: x-internal-token: <REMINDER_INTERNAL_TOKEN>
 * for dashboard "Send Today's Reminders" button.
 */

process.env.NETLIFY = 'true';

const { sendTomorrowReminders } = require('../../server/services/appointment-reminders');
const logger = require('../../server/utils/logger');

exports.handler = async (event) => {
    // Block external callers on manual POST path
    if (event.httpMethod === 'POST') {
        const token = event.headers?.['x-internal-token'];
        const expected = process.env.REMINDER_INTERNAL_TOKEN || process.env.BACKGROUND_FUNCTION_TOKEN || 'autojordan-internal';
        if (token !== expected) {
            return { statusCode: 401, body: 'Unauthorized' };
        }
    }

    logger.info('[SEND-REMINDERS] Function triggered', {
        source: event.httpMethod === 'POST' ? 'manual' : 'scheduled',
    });

    try {
        const result = await sendTomorrowReminders();
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (e) {
        logger.error('[SEND-REMINDERS] Unhandled error:', e?.message);
        return { statusCode: 500, body: JSON.stringify({ error: e?.message }) };
    }
};
