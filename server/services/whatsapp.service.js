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
    // Serverless (Netlify): 26s hard limit — keep retries minimal
    // 2 attempts × 500ms base delay = worst case ~1.5s extra, not 6s
    this.retryAttempts = 2;
    this.retryDelay = 500;
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
      if (attempt < this.retryAttempts) {
        logger.warn(`فشل الإرسال، المحاولة ${attempt}/${this.retryAttempts}`, error.message);
        await this._sleep(this.retryDelay * attempt);
        return this._sendWithRetry(payload, attempt + 1);
      }

      logger.error('فشل إرسال الرسالة بعد جميع المحاولات', {
        error: error.response?.data || error.message,
        to: payload.to,
      });

      throw new Error(`فشل إرسال الرسالة: ${error.response?.data?.error?.message || error.message}`);
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
