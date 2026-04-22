/**
 * أوتو جوردن - Appointment Reminders
 *
 * Queries bookings scheduled for tomorrow with status=confirmed,
 * sends each customer a WhatsApp reminder, and marks the booking
 * as reminded so duplicates never fire on a re-run.
 *
 * Designed to be called from a Netlify Scheduled Function (cron)
 * or a POST to an internal endpoint (e.g. /api/internal/send-reminders).
 *
 * Deploy as netlify/functions/send-reminders.js and configure in netlify.toml:
 *
 *   [functions.send-reminders]
 *     schedule = "0 15 * * *"   # 6 PM Amman time (UTC+3) = 15:00 UTC
 *
 * Set REMINDER_INTERNAL_TOKEN env var to protect the endpoint from public calls.
 */

const db = require('../database/db');
const logger = require('../utils/logger');

function getTomorrowDateString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0]; // 'YYYY-MM-DD'
}

/**
 * Send reminders for all confirmed bookings scheduled for tomorrow.
 * Returns a summary { sent, skipped, errors }.
 */
async function sendTomorrowReminders() {
    const tomorrow = getTomorrowDateString();
    logger.info(`[REMINDERS] Checking bookings for ${tomorrow}`);

    let bookings = [];
    try {
        bookings = await db.getAllBookings({ date: tomorrow, status: 'confirmed' });
    } catch (e) {
        logger.error('[REMINDERS] Failed to fetch bookings:', e?.message);
        return { sent: 0, skipped: 0, errors: 1 };
    }

    // Filter out already-reminded bookings (staff_notes contains 'reminded')
    const toRemind = bookings.filter(b => !b.staff_notes?.includes('[reminded]'));
    logger.info(`[REMINDERS] ${bookings.length} confirmed tomorrow, ${toRemind.length} not yet reminded`);

    const whatsapp = require('./whatsapp.service');
    let sent = 0, skipped = 0, errors = 0;

    for (const booking of toRemind) {
        const phone = booking.customer_phone;
        if (!phone) { skipped++; continue; }

        const msg =
            `مرحباً ${booking.customer_name || ''} 👋\n` +
            `تذكير بموعد صيانة سيارتك بكرا 🔧\n\n` +
            `🚗 ${booking.car_make || ''} ${booking.car_model || ''}\n` +
            `🛠 ${booking.service_type || 'صيانة'}\n` +
            `⏰ الساعة ${booking.preferred_time || ''}\n` +
            `🏢 فرع أوتو جوردن - ${booking.branch || ''}\n\n` +
            `للتعديل أو الإلغاء: 06-5000001 🙏`;

        try {
            await whatsapp.sendTextMessage(phone, msg);
            // Mark as reminded in staff_notes so we never send twice
            await db.updateBookingStatus(
                booking.id,
                booking.status,
                ((booking.staff_notes || '') + ' [reminded]').trim()
            );
            sent++;
            logger.info(`[REMINDERS] Sent to ${phone} booking#${booking.id}`);
        } catch (e) {
            errors++;
            logger.error(`[REMINDERS] Failed for booking#${booking.id}:`, e?.message);
        }
    }

    logger.info(`[REMINDERS] Done — sent=${sent} skipped=${skipped} errors=${errors}`);
    return { sent, skipped, errors };
}

module.exports = { sendTomorrowReminders, getTomorrowDateString };
