/**
 * خدمة التحليلات
 * Analytics Service
 */

const sheetsService = require('./sheets.service');
const { analyzeSentiment, detectTopic, extractTopWords } = require('../utils/sentiment');
const logger = require('../utils/logger');

class AnalyticsService {
  constructor() {
    this.cachedAnalytics = null;
    this.cacheTime = null;
    this.cacheDuration = 5 * 60 * 1000; // 5 دقائق
  }

  /**
   * الحصول على بيانات التحليل الكاملة
   */
  async getFullAnalytics() {
    // استخدام الكاش إذا كان صالحاً
    if (this.cachedAnalytics && this.cacheTime &&
        Date.now() - this.cacheTime < this.cacheDuration) {
      return this.cachedAnalytics;
    }

    try {
      const [baseAnalytics, conversations] = await Promise.all([
        sheetsService.getAnalyticsData(),
        sheetsService.getAllConversations(500),
      ]);

      // استخراج الكلمات الأكثر استخداماً
      const customerMessages = conversations.map(c => c.customerMessage).filter(Boolean);
      const wordCloud = extractTopWords(customerMessages);

      // أكثر الأسئلة تكراراً
      const questionFrequency = this._analyzeQuestionFrequency(conversations);

      // متوسط طول المحادثة
      const avgConversationLength = this._calcAvgConversationLength(conversations);

      const analytics = {
        ...baseAnalytics,
        wordCloud,
        questionFrequency,
        avgConversationLength,
        todayStats: this._getTodayStats(conversations),
        weekStats: this._getWeekStats(conversations),
        monthStats: this._getMonthStats(conversations),
      };

      // تخزين في الكاش
      this.cachedAnalytics = analytics;
      this.cacheTime = Date.now();

      return analytics;
    } catch (error) {
      logger.error('خطأ في جلب التحليلات', error);
      throw error;
    }
  }

  /**
   * إحصائيات اليوم
   */
  _getTodayStats(conversations) {
    const today = new Date().toISOString().split('T')[0];
    const todayConvs = conversations.filter(c =>
      c.timestamp && c.timestamp.startsWith(today)
    );

    return {
      total: todayConvs.length,
      avgResponseTime: this._calcAvgResponseTime(todayConvs),
      escalated: todayConvs.filter(c => c.escalated).length,
      uniqueCustomers: new Set(todayConvs.map(c => c.phoneNumber)).size,
    };
  }

  /**
   * إحصائيات الأسبوع
   */
  _getWeekStats(conversations) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekConvs = conversations.filter(c =>
      c.timestamp && new Date(c.timestamp) >= weekAgo
    );

    return {
      total: weekConvs.length,
      avgResponseTime: this._calcAvgResponseTime(weekConvs),
      escalated: weekConvs.filter(c => c.escalated).length,
      uniqueCustomers: new Set(weekConvs.map(c => c.phoneNumber)).size,
    };
  }

  /**
   * إحصائيات الشهر
   */
  _getMonthStats(conversations) {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthConvs = conversations.filter(c =>
      c.timestamp && new Date(c.timestamp) >= monthAgo
    );

    return {
      total: monthConvs.length,
      avgResponseTime: this._calcAvgResponseTime(monthConvs),
      escalated: monthConvs.filter(c => c.escalated).length,
      uniqueCustomers: new Set(monthConvs.map(c => c.phoneNumber)).size,
    };
  }

  /**
   * تحليل تكرار الأسئلة
   */
  _analyzeQuestionFrequency(conversations) {
    const questionPatterns = {};

    conversations.forEach(c => {
      if (!c.customerMessage) return;
      const msg = c.customerMessage.toLowerCase().trim();

      // تبسيط السؤال
      const simplified = msg
        .replace(/[؟?!،,]/g, '')
        .replace(/\s+/g, ' ')
        .substring(0, 50);

      questionPatterns[simplified] = (questionPatterns[simplified] || 0) + 1;
    });

    return Object.entries(questionPatterns)
      .filter(([, count]) => count > 1)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));
  }

  /**
   * متوسط طول المحادثة
   */
  _calcAvgConversationLength(conversations) {
    const byPhone = {};
    conversations.forEach(c => {
      byPhone[c.phoneNumber] = (byPhone[c.phoneNumber] || 0) + 1;
    });

    const lengths = Object.values(byPhone);
    if (lengths.length === 0) return 0;

    return Math.round(lengths.reduce((sum, l) => sum + l, 0) / lengths.length * 10) / 10;
  }

  /**
   * متوسط وقت الرد
   */
  _calcAvgResponseTime(conversations) {
    if (conversations.length === 0) return 0;
    const total = conversations.reduce((sum, c) => sum + (c.responseTime || 0), 0);
    return Math.round(total / conversations.length);
  }

  /**
   * مسح الكاش
   */
  clearCache() {
    this.cachedAnalytics = null;
    this.cacheTime = null;
  }
}

module.exports = new AnalyticsService();
