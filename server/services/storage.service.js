/**
 * أوتو جوردن - خدمة التخزين في الذاكرة
 * In-Memory Storage Service - Auto Jordan Car Dealership
 *
 * ملاحظة: البيانات تُحفظ في الذاكرة أثناء تشغيل الخادم.
 * في بيئة Serverless (Netlify) تُحفظ لفترة محدودة.
 * لحفظ دائم أضف Supabase أو MongoDB Atlas لاحقاً.
 */

const { analyzeSentiment, detectTopic } = require('../utils/sentiment');
const logger = require('../utils/logger');

class StorageService {
  constructor() {
    this.conversations = []; // كل المحادثات
    this.maxSize = 2000;      // حد أقصى
    logger.info('🚗 أوتو جوردن - خدمة التخزين جاهزة (لا يوجد بيانات تجريبية)');
  }

  /**
   * تسجيل محادثة جديدة
   */
  async logConversation(data) {
    try {
      const entry = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: data.timestamp || new Date().toISOString(),
        phoneNumber: data.phoneNumber,
        customerName: data.customerName || data.phoneNumber,
        customerMessage: data.customerMessage,
        aiResponse: data.aiResponse,
        responseTime: data.responseTime || 0,
        sentiment: data.sentiment || 'محايد',
        topic: data.topic || 'عام',
        escalated: data.escalated || false,
        messageId: data.messageId || '',
        status: data.status || 'delivered',
      };

      this.conversations.push(entry);

      // الحفاظ على الحد الأقصى (FIFO)
      if (this.conversations.length > this.maxSize) {
        this.conversations.shift();
      }

      logger.info(`تم تسجيل المحادثة (${this.conversations.length} إجمالاً)`);
      return true;
    } catch (error) {
      logger.error('خطأ في تسجيل المحادثة', error);
      return false;
    }
  }

  /**
   * الحصول على كل المحادثات (مرتبة من الأحدث)
   */
  async getAllConversations(limit = 200) {
    return [...this.conversations]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * الحصول على محادثات رقم معين
   */
  async getConversationsByPhone(phoneNumber) {
    return this.conversations
      .filter(c => c.phoneNumber === phoneNumber)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * بيانات التحليل
   */
  async getAnalyticsData() {
    const convs = [...this.conversations];

    // آخر 30 يوم
    const last30Days = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last30Days[d.toISOString().split('T')[0]] = 0;
    }
    convs.forEach(c => {
      const date = c.timestamp?.split('T')[0];
      if (date && last30Days.hasOwnProperty(date)) last30Days[date]++;
    });

    // توزيع المواضيع
    const topicCounts = {};
    convs.forEach(c => {
      topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
    });

    // ساعات الذروة
    const hourCounts = Array(24).fill(0);
    convs.forEach(c => {
      if (c.timestamp) hourCounts[new Date(c.timestamp).getHours()]++;
    });

    // تحليل المشاعر بالأيام (آخر 7 أيام)
    const sentimentByDay = {};
    convs.forEach(c => {
      const date = c.timestamp?.split('T')[0];
      if (!date) return;
      if (!sentimentByDay[date]) {
        sentimentByDay[date] = { positive: 0, negative: 0, neutral: 0, total: 0 };
      }
      sentimentByDay[date].total++;
      if (c.sentiment === 'إيجابي') sentimentByDay[date].positive++;
      else if (c.sentiment === 'سلبي') sentimentByDay[date].negative++;
      else sentimentByDay[date].neutral++;
    });

    const totalMessages = convs.length;
    const avgResponseTime = totalMessages > 0
      ? Math.round(convs.reduce((s, c) => s + (c.responseTime || 0), 0) / totalMessages)
      : 0;

    return {
      dailyMessages: Object.entries(last30Days).map(([date, count]) => ({ date, count })),
      topicDistribution: Object.entries(topicCounts).map(([name, value]) => ({ name, value })),
      hourlyDistribution: hourCounts.map((count, hour) => ({ hour: `${hour}:00`, count })),
      sentimentByDay: Object.entries(sentimentByDay).map(([date, data]) => ({
        date,
        positive: data.total > 0 ? Math.round((data.positive / data.total) * 100) : 0,
        negative: data.total > 0 ? Math.round((data.negative / data.total) * 100) : 0,
        neutral: data.total > 0 ? Math.round((data.neutral / data.total) * 100) : 0,
      })),
      totalMessages,
      avgResponseTime,
      escalationRate: totalMessages > 0
        ? Math.round((convs.filter(c => c.escalated).length / totalMessages) * 100)
        : 0,
      uniqueCustomers: new Set(convs.map(c => c.phoneNumber)).size,
    };
  }

  /**
   * إحصائيات حسب الفترة
   */
  getStatsByPeriod(days) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const convs = this.conversations.filter(c =>
      c.timestamp && new Date(c.timestamp) >= from
    );
    return {
      total: convs.length,
      avgResponseTime: convs.length > 0
        ? Math.round(convs.reduce((s, c) => s + (c.responseTime || 0), 0) / convs.length)
        : 0,
      escalated: convs.filter(c => c.escalated).length,
      uniqueCustomers: new Set(convs.map(c => c.phoneNumber)).size,
    };
  }

}


// Singleton - نفس الكائن لكل الطلبات في نفس الـ instance
const storage = new StorageService();
module.exports = storage;
