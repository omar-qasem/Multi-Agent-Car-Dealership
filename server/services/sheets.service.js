/**
 * خدمة Google Sheets
 * Google Sheets API Service
 */

const { google } = require('googleapis');
const config = require('../config/env');
const logger = require('../utils/logger');

class SheetsService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = config.sheets.spreadsheetId;
    this.mainSheet = config.sheets.mainSheetName;
    this.summarySheet = config.sheets.summarySheetName;
    this._initialize();
  }

  async _initialize() {
    try {
      if (!config.sheets.serviceAccountEmail || !config.sheets.privateKey) {
        logger.warn('Google Sheets credentials غير موجودة - التسجيل معطل');
        return;
      }

      const auth = new google.auth.JWT({
        email: config.sheets.serviceAccountEmail,
        key: config.sheets.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });

      // التحقق من وجود الشيتات وإنشاؤها إذا لم تكن موجودة
      await this._ensureSheetsExist();

      logger.success('تم الاتصال بـ Google Sheets بنجاح');
    } catch (error) {
      logger.error('خطأ في تهيئة Google Sheets', error.message);
    }
  }

  /**
   * التأكد من وجود الشيتات والرؤوس
   */
  async _ensureSheetsExist() {
    if (!this.sheets) return;

    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);

      // إنشاء شيت المحادثات إذا لم يكن موجوداً
      if (!sheetNames.includes(this.mainSheet)) {
        await this._createSheet(this.mainSheet);
        await this._addHeaders(this.mainSheet, [
          'Timestamp', 'Phone Number', 'Customer Name', 'Customer Message',
          'AI Response', 'Response Time (ms)', 'Sentiment', 'Topic',
          'Escalated', 'Message ID', 'Status',
        ]);
      }

      // إنشاء شيت الملخص اليومي
      if (!sheetNames.includes(this.summarySheet)) {
        await this._createSheet(this.summarySheet);
        await this._addHeaders(this.summarySheet, [
          'Date', 'Total Messages', 'Avg Response Time (ms)',
          'Top Topic', 'Positive %', 'Negative %', 'Neutral %',
          'Escalation Rate %', 'Unique Customers',
        ]);
      }
    } catch (error) {
      logger.error('خطأ في التأكد من وجود الشيتات', error.message);
    }
  }

  /**
   * إنشاء شيت جديد
   */
  async _createSheet(sheetName) {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: { title: sheetName },
          },
        }],
      },
    });
    logger.info(`تم إنشاء الشيت: ${sheetName}`);
  }

  /**
   * إضافة رؤوس الأعمدة
   */
  async _addHeaders(sheetName, headers) {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: { values: [headers] },
    });
  }

  /**
   * تسجيل محادثة جديدة
   * @param {object} data - بيانات المحادثة
   */
  async logConversation(data) {
    if (!this.sheets) {
      logger.warn('Google Sheets غير متاحة - تخطي التسجيل');
      return false;
    }

    try {
      const row = [
        data.timestamp || new Date().toISOString(),
        data.phoneNumber,
        data.customerName || data.phoneNumber,
        data.customerMessage,
        data.aiResponse,
        data.responseTime || 0,
        data.sentiment || 'محايد',
        data.topic || 'عام',
        data.escalated ? 'نعم' : 'لا',
        data.messageId || '',
        data.status || 'delivered',
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.mainSheet}!A:K`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] },
      });

      logger.info('تم تسجيل المحادثة في Sheets');
      return true;
    } catch (error) {
      logger.error('خطأ في تسجيل المحادثة', error.message);
      return false;
    }
  }

  /**
   * الحصول على كل المحادثات
   */
  async getAllConversations(limit = 100) {
    if (!this.sheets) return this._getMockConversations();

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.mainSheet}!A2:K${limit + 1}`,
      });

      const rows = response.data.values || [];
      return rows.map(row => ({
        timestamp: row[0],
        phoneNumber: row[1],
        customerName: row[2],
        customerMessage: row[3],
        aiResponse: row[4],
        responseTime: parseInt(row[5]) || 0,
        sentiment: row[6],
        topic: row[7],
        escalated: row[8] === 'نعم',
        messageId: row[9],
        status: row[10],
      })).reverse();
    } catch (error) {
      logger.error('خطأ في جلب المحادثات', error.message);
      return this._getMockConversations();
    }
  }

  /**
   * تحديث الملخص اليومي
   */
  async updateDailySummary() {
    if (!this.sheets) return;

    try {
      const conversations = await this.getAllConversations(1000);
      const today = new Date().toISOString().split('T')[0];
      const todayConversations = conversations.filter(c =>
        c.timestamp && c.timestamp.startsWith(today)
      );

      if (todayConversations.length === 0) return;

      // حساب الإحصائيات
      const totalMessages = todayConversations.length;
      const avgResponseTime = Math.round(
        todayConversations.reduce((sum, c) => sum + (c.responseTime || 0), 0) / totalMessages
      );

      // أكثر موضوع تكراراً
      const topicCounts = {};
      todayConversations.forEach(c => {
        topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
      });
      const topTopic = Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'عام';

      // نسب المشاعر
      const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
      todayConversations.forEach(c => {
        if (c.sentiment === 'إيجابي') sentimentCounts.positive++;
        else if (c.sentiment === 'سلبي') sentimentCounts.negative++;
        else sentimentCounts.neutral++;
      });

      const positivePercent = Math.round((sentimentCounts.positive / totalMessages) * 100);
      const negativePercent = Math.round((sentimentCounts.negative / totalMessages) * 100);
      const neutralPercent = 100 - positivePercent - negativePercent;

      // معدل التصعيد
      const escalated = todayConversations.filter(c => c.escalated).length;
      const escalationRate = Math.round((escalated / totalMessages) * 100);

      // العملاء الفريدين
      const uniqueCustomers = new Set(todayConversations.map(c => c.phoneNumber)).size;

      const summaryRow = [
        today, totalMessages, avgResponseTime, topTopic,
        `${positivePercent}%`, `${negativePercent}%`, `${neutralPercent}%`,
        `${escalationRate}%`, uniqueCustomers,
      ];

      // البحث عن صف اليوم وتحديثه أو إضافته
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.summarySheet}!A:I`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [summaryRow] },
      });

      logger.success('تم تحديث الملخص اليومي');
    } catch (error) {
      logger.error('خطأ في تحديث الملخص اليومي', error.message);
    }
  }

  /**
   * الحصول على بيانات التحليل
   */
  async getAnalyticsData() {
    if (!this.sheets) return this._getMockAnalytics();

    try {
      const conversations = await this.getAllConversations(1000);

      // بيانات آخر 30 يوم
      const last30Days = {};
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last30Days[dateStr] = 0;
      }

      conversations.forEach(c => {
        if (c.timestamp) {
          const date = c.timestamp.split('T')[0];
          if (last30Days.hasOwnProperty(date)) {
            last30Days[date]++;
          }
        }
      });

      // توزيع المواضيع
      const topicCounts = {};
      conversations.forEach(c => {
        topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
      });

      // ساعات الذروة
      const hourCounts = Array(24).fill(0);
      conversations.forEach(c => {
        if (c.timestamp) {
          const hour = new Date(c.timestamp).getHours();
          hourCounts[hour]++;
        }
      });

      // تحليل المشاعر عبر الزمن
      const sentimentByDay = {};
      conversations.forEach(c => {
        if (c.timestamp) {
          const date = c.timestamp.split('T')[0];
          if (!sentimentByDay[date]) {
            sentimentByDay[date] = { positive: 0, negative: 0, neutral: 0, total: 0 };
          }
          sentimentByDay[date].total++;
          if (c.sentiment === 'إيجابي') sentimentByDay[date].positive++;
          else if (c.sentiment === 'سلبي') sentimentByDay[date].negative++;
          else sentimentByDay[date].neutral++;
        }
      });

      return {
        dailyMessages: Object.entries(last30Days).map(([date, count]) => ({ date, count })),
        topicDistribution: Object.entries(topicCounts).map(([name, value]) => ({ name, value })),
        hourlyDistribution: hourCounts.map((count, hour) => ({
          hour: `${hour}:00`,
          count,
        })),
        sentimentByDay: Object.entries(sentimentByDay).map(([date, data]) => ({
          date,
          positive: Math.round((data.positive / data.total) * 100),
          negative: Math.round((data.negative / data.total) * 100),
          neutral: Math.round((data.neutral / data.total) * 100),
        })),
        totalMessages: conversations.length,
        avgResponseTime: Math.round(
          conversations.reduce((s, c) => s + (c.responseTime || 0), 0) / (conversations.length || 1)
        ),
        escalationRate: Math.round(
          (conversations.filter(c => c.escalated).length / (conversations.length || 1)) * 100
        ),
        uniqueCustomers: new Set(conversations.map(c => c.phoneNumber)).size,
      };
    } catch (error) {
      logger.error('خطأ في جلب بيانات التحليل', error.message);
      return this._getMockAnalytics();
    }
  }

  /**
   * بيانات تجريبية للعرض
   */
  _getMockConversations() {
    const names = ['أحمد محمد', 'فاطمة علي', 'خالد السعيد', 'نورة القحطاني', 'سامي الغامدي'];
    const messages = [
      { customer: 'كم سعر المنتج؟', ai: 'شكراً لاستفسارك! سعر المنتج يبدأ من 99 ريال. هل تريد معرفة المزيد من التفاصيل؟' },
      { customer: 'عندي مشكلة في الطلب', ai: 'نأسف لسماع ذلك. هل يمكنك إخباري برقم الطلب لأتمكن من مساعدتك؟' },
      { customer: 'شكراً الخدمة ممتازة', ai: 'شكراً لكلامك الطيب! يسعدنا خدمتك دائماً.' },
      { customer: 'متى يوصل طلبي؟', ai: 'الطلبات تصل عادةً خلال 3-5 أيام عمل. هل تريد تتبع طلبك؟' },
    ];

    return Array.from({ length: 20 }, (_, i) => {
      const msg = messages[i % messages.length];
      const date = new Date();
      date.setHours(date.getHours() - i * 2);
      return {
        timestamp: date.toISOString(),
        phoneNumber: `9665${String(50000000 + i).padStart(8, '0')}`,
        customerName: names[i % names.length],
        customerMessage: msg.customer,
        aiResponse: msg.ai,
        responseTime: Math.floor(Math.random() * 2000) + 500,
        sentiment: ['إيجابي', 'محايد', 'سلبي'][Math.floor(Math.random() * 3)],
        topic: ['أسعار', 'منتجات', 'شكاوى', 'دعم فني', 'توصيل'][i % 5],
        escalated: Math.random() > 0.8,
        messageId: `msg_${i}`,
        status: 'delivered',
      };
    });
  }

  _getMockAnalytics() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push({
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 50) + 10,
      });
    }

    return {
      dailyMessages: days,
      topicDistribution: [
        { name: 'أسعار', value: 35 },
        { name: 'منتجات', value: 25 },
        { name: 'دعم فني', value: 20 },
        { name: 'شكاوى', value: 12 },
        { name: 'توصيل', value: 8 },
      ],
      hourlyDistribution: Array.from({ length: 24 }, (_, h) => ({
        hour: `${h}:00`,
        count: h >= 9 && h <= 18 ? Math.floor(Math.random() * 20) + 5 : Math.floor(Math.random() * 3),
      })),
      sentimentByDay: days.slice(-7).map(d => ({
        date: d.date,
        positive: 60 + Math.floor(Math.random() * 20),
        negative: 10 + Math.floor(Math.random() * 15),
        neutral: 20 + Math.floor(Math.random() * 10),
      })),
      totalMessages: 847,
      avgResponseTime: 1240,
      escalationRate: 12,
      uniqueCustomers: 234,
    };
  }
}

module.exports = new SheetsService();
