import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Download, RefreshCw, TrendingUp, MessageSquare, Smile, Frown, Meh } from 'lucide-react';

const SENTIMENT_COLORS = {
  positive: '#25D366',
  negative: '#ef4444',
  neutral: '#9ca3af',
};

// مكون Word Cloud بسيط
const WordCloudComponent = ({ words }) => {
  if (!words || words.length === 0) return null;
  const maxValue = Math.max(...words.map(w => w.value));

  return (
    <div className="flex flex-wrap gap-2 justify-center p-4">
      {words.slice(0, 30).map((word, i) => {
        const size = Math.max(12, Math.min(28, (word.value / maxValue) * 28));
        const opacity = 0.5 + (word.value / maxValue) * 0.5;
        return (
          <span
            key={i}
            className="cursor-default hover:text-whatsapp-green transition-colors duration-200"
            style={{
              fontSize: `${size}px`,
              opacity,
              color: i % 3 === 0 ? '#25D366' : i % 3 === 1 ? '#128C7E' : '#059669',
              fontWeight: word.value > maxValue * 0.5 ? '700' : '400',
            }}
            title={`${word.text}: ${word.value} مرة`}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/analytics');
      setAnalytics(res.data.data);
    } catch (error) {
      console.error('خطأ في التحليلات:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = await axios.get(`/api/analytics/export?format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json',
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `conversations_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      alert('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const LoadingSkeleton = () => (
    <div className="h-64 bg-gray-50 dark:bg-gray-700 rounded-xl animate-pulse" />
  );

  // إحصائيات المشاعر
  const sentimentStats = analytics ? {
    positive: analytics.sentimentByDay?.reduce((sum, d) => sum + d.positive, 0) / (analytics.sentimentByDay?.length || 1),
    negative: analytics.sentimentByDay?.reduce((sum, d) => sum + d.negative, 0) / (analytics.sentimentByDay?.length || 1),
    neutral: analytics.sentimentByDay?.reduce((sum, d) => sum + d.neutral, 0) / (analytics.sentimentByDay?.length || 1),
  } : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">التحليلات المتقدمة</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            تحليل شامل لأداء الردود الذكية وتفاعل العملاء
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Download size={15} />
            تصدير CSV
          </button>
        </div>
      </div>

      {/* بطاقات المشاعر */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'إيجابية', value: sentimentStats?.positive, icon: Smile, color: 'green', key: 'positive' },
          { label: 'محايدة', value: sentimentStats?.neutral, icon: Meh, color: 'gray', key: 'neutral' },
          { label: 'سلبية', value: sentimentStats?.negative, icon: Frown, color: 'red', key: 'negative' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="stat-card">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  item.key === 'positive' ? 'bg-green-50 dark:bg-green-900/20 text-green-500' :
                  item.key === 'negative' ? 'bg-red-50 dark:bg-red-900/20 text-red-500' :
                  'bg-gray-50 dark:bg-gray-700 text-gray-500'
                }`}>
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {loading ? '...' : `${Math.round(item.value || 0)}%`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* تحليل المشاعر عبر الزمن */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm
                      border border-gray-100 dark:border-gray-700">
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
          <TrendingUp size={18} className="text-whatsapp-green" />
          تحليل المشاعر عبر الزمن
        </h2>
        <div className="h-64">
          {loading ? <LoadingSkeleton /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics?.sentimentByDay || []}>
                <defs>
                  <linearGradient id="positiveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negativeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} unit="%" />
                <Tooltip
                  formatter={(v, n) => [`${v}%`, n === 'positive' ? 'إيجابي' : n === 'negative' ? 'سلبي' : 'محايد']}
                  contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '12px', fontFamily: 'Tajawal' }}
                />
                <Legend
                  formatter={(value) => value === 'positive' ? 'إيجابي' : value === 'negative' ? 'سلبي' : 'محايد'}
                />
                <Area type="monotone" dataKey="positive" stroke="#25D366" fill="url(#positiveGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="negative" stroke="#ef4444" fill="url(#negativeGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="neutral" stroke="#9ca3af" fill="none" strokeWidth={1.5} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Word Cloud + أكثر الأسئلة */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Word Cloud */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm
                        border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-purple-500" />
            أكثر الكلمات استخداماً
          </h2>
          {loading ? <LoadingSkeleton /> : (
            <WordCloudComponent words={analytics?.wordCloud || []} />
          )}
        </div>

        {/* أكثر الأسئلة تكراراً */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm
                        border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-blue-500" />
            أكثر الأسئلة تكراراً
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-12 bg-gray-50 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(analytics?.questionFrequency || []).slice(0, 8).map((q, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl
                                        bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100
                                        dark:hover:bg-gray-700 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-whatsapp-green text-white text-xs
                                   flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                    {q.question}
                  </p>
                  <span className="text-xs font-medium text-whatsapp-green bg-whatsapp-green/10
                                   px-2 py-1 rounded-full flex-shrink-0">
                    {q.count}x
                  </span>
                </div>
              ))}
              {(!analytics?.questionFrequency || analytics.questionFrequency.length === 0) && (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد بيانات كافية بعد</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* إحصائيات إضافية */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">متوسط الرسائل لكل محادثة</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {loading ? '...' : analytics?.avgConversationLength || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">رسالة</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">معدل التصعيد للدعم البشري</p>
          <p className="text-3xl font-bold text-orange-500">
            {loading ? '...' : `${analytics?.escalationRate || 0}%`}
          </p>
          <p className="text-xs text-gray-400 mt-1">من الرسائل</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">إجمالي الرسائل</p>
          <p className="text-3xl font-bold text-whatsapp-green">
            {loading ? '...' : analytics?.totalMessages?.toLocaleString('ar') || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">رسالة معالجة</p>
        </div>
      </div>
    </div>
  );
}
