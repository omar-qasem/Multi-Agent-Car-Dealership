/**
 * خدمة WhatsApp Cloud API
 * WhatsApp Business Cloud API Service
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.baseUrl = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;
    this.headers = {
      'Authorization': `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    };
    // Serverless (Netlify): 26s hard limit — keep retries minimal.
    // 2 attempts × 500ms base delay = worst case ~1.5s extra, not 6s.
    this.retryAttempts = 2;
    this.retryDelay = 500;

    // P1-03: When Meta returns 429 Too Many Requests we must honor the
    // Retry-After hint, but we also can't sleep arbitrarily long inside a
    // Lambda with a 26s total budget. This cap is the hard ceiling.
    // (3s leaves ~20s+ of runway for the actual send plus state saves.)
    this.retryAfterMaxMs = 3000;

    // Meta 4xx status codes that are permanent — no amount of retrying
    // will turn them into a 200. Retrying wastes the Lambda budget and
    // amplifies quota pressure.
    this.nonRetryableStatuses = new Set([400, 401, 403, 404, 410, 422]);
  }

  /**
   * Parse a Retry-After header into a bounded millisecond sleep.
   * Meta sends Retry-After as seconds (per RFC 7231). Some stacks send an
   * HTTP-date; we handle both. Returns null if the header is missing or
   * malformed — caller falls back to exponential backoff.
   */
  _parseRetryAfter(headers) {
    if (!headers) return null;
    const raw = headers['retry-after'] ?? headers['Retry-After'] ?? headers['RETRY-AFTER'];
    if (raw === undefined || raw === null || raw === '') return null;

    // Numeric — delta-seconds
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.min(Math.round(asNumber * 1000), this.retryAfterMaxMs);
    }
    // HTTP-date — compute delta from now
    const asDateMs = Date.parse(raw);
    if (!Number.isNaN(asDateMs)) {
      const delta = asDateMs - Date.now();
      if (delta <= 0) return 0;
      return Math.min(delta, this.retryAfterMaxMs);
    }
    return null;
  }

  /**
   * إرسال رسالة نصية
   * @param {string} to - رقم الهاتف بصيغة دولية
   * @param {string} message - نص الرسالة
   * @returns {object} - استجابة API
   */
  async sendTextMessage(to, message) {
    // WhatsApp Cloud API enforces a 4096-character limit per text message.
    // Truncate gracefully to avoid API rejection.
    const MAX_WA_CHARS = 4096;
    let body = message || '';
    if (body.length > MAX_WA_CHARS) {
      body = body.substring(0, MAX_WA_CHARS - 40) + '\n\n... للمزيد اتصل 06-5000001';
      logger.warn(`⚠️ Message truncated from ${message.length} to ${body.length} chars`);
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    };

    return await this._sendWithRetry(payload);
  }

  /**
   * إرسال رسالة مع أزرار (Interactive)
   * @param {string} to - رقم الهاتف
   * @param {string} bodyText - نص الرسالة
   * @param {Array} buttons - قائمة الأزرار
   */
  async sendInteractiveMessage(to, bodyText, buttons) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((btn, idx) => ({
            type: 'reply',
            reply: {
              id: `btn_${idx}`,
              title: btn,
            },
          })),
        },
      },
    };

    return await this._sendWithRetry(payload);
  }

  /**
   * إرسال مؤشر الكتابة ("typing...") للعميل.
   * WhatsApp Cloud API: POST /messages with type=reaction is NOT the right
   * endpoint. The correct way is to send a "typing" status update via the
   * statuses endpoint. This shows the "..." bubble while the AI processes.
   *
   * Note: Meta documents this under "Sending Typing Indicators" — it uses
   * the same /messages endpoint with `type: "reaction"` pattern but with
   * a `typing` action body format. If Meta changes the endpoint this is
   * the only place to update.
   */
  async sendTypingIndicator(to) {
    // Typing indicators are not yet supported by the WhatsApp Cloud API.
    // The previously used `type: 'typing'` payload results in a 400 Bad Request.
    // Disabled to prevent log cluttering and wasted API calls.
    return;
  }

  /**
   * تحديد حالة القراءة
   * @param {string} messageId - معرف الرسالة
   */
  async markAsRead(messageId) {
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    try {
      const response = await axios.post(this.baseUrl + '/messages', payload, {
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      logger.warn('فشل تحديد حالة القراءة', error.message);
    }
  }

  /**
   * إرسال مع إعادة المحاولة
   * @param {object} payload - البيانات
   *
   * P1-03 retry policy:
   *   - 2xx            → success (return immediately)
   *   - 429            → honor Retry-After header (bounded to retryAfterMaxMs),
   *                      count the attempt, retry
   *   - 4xx (non-429)  → TERMINAL. Don't retry a 400/401/403/404/410/422 —
   *                      the payload is broken and retry just wastes budget.
   *   - 5xx / network  → exponential backoff, up to retryAttempts
   */
  async _sendWithRetry(payload, attempt = 1) {
    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        payload,
        { headers: this.headers, timeout: 10000 }
      );

      const responseTime = Date.now() - startTime;
      logger.success(`تم إرسال الرسالة بنجاح (${responseTime}ms)`, {
        to: payload.to,
        messageId: response.data?.messages?.[0]?.id,
      });

      return {
        success: true,
        messageId: response.data?.messages?.[0]?.id,
        responseTime,
        data: response.data,
      };
    } catch (error) {
      const status = error.response?.status;

      // Terminal 4xx — don't retry, fail fast so the caller can respond.
      if (status && this.nonRetryableStatuses.has(status)) {
        logger.error(`فشل الإرسال (${status}) — لا تعاد المحاولة`, {
          status,
          error: error.response?.data || error.message,
          to: payload.to,
        });
        const err = new Error(`فشل إرسال الرسالة: ${error.response?.data?.error?.message || error.message}`);
        err.status = status;
        err.nonRetryable = true;
        throw err;
      }

      if (attempt < this.retryAttempts) {
        // 429 → use Retry-After from headers when Meta gives us one.
        let delay;
        if (status === 429) {
          const hinted = this._parseRetryAfter(error.response?.headers);
          delay = hinted !== null ? hinted : this.retryDelay * attempt;
          logger.warn(`429 Too Many Requests — انتظار ${delay}ms (hinted=${hinted !== null}) قبل المحاولة ${attempt + 1}/${this.retryAttempts}`, {
            to: payload.to,
          });
        } else {
          delay = this.retryDelay * attempt;
          logger.warn(`فشل الإرسال، المحاولة ${attempt}/${this.retryAttempts} (status=${status || 'network'})`, error.message);
        }
        await this._sleep(delay);
        return this._sendWithRetry(payload, attempt + 1);
      }

      logger.error('فشل إرسال الرسالة بعد جميع المحاولات', {
        error: error.response?.data || error.message,
        to: payload.to,
        status,
      });

      const err = new Error(`فشل إرسال الرسالة: ${error.response?.data?.error?.message || error.message}`);
      err.status = status;
      throw err;
    }
  }

  /**
   * التحقق من التوكن (Webhook Verification)
   * @param {object} query - معاملات الطلب
   */
  verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      logger.success('تم التحقق من الـ Webhook بنجاح');
      return { verified: true, challenge };
    }

    logger.warn('فشل التحقق من الـ Webhook', { mode, token });
    return { verified: false };
  }

  /**
   * معالجة الرسائل الواردة
   * @param {object} body - جسم الطلب
   */
  parseIncomingMessage(body) {
    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) return null;

      const message = value.messages[0];
      const contact = value.contacts?.[0];

      return {
        messageId: message.id,
        from: message.from,
        timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        type: message.type,
        text: message.text?.body || '',
        name: contact?.profile?.name || message.from,
        phoneNumberId: value.metadata?.phone_number_id,
      };
    } catch (error) {
      logger.error('خطأ في تحليل الرسالة الواردة', error);
      return null;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new WhatsAppService();
