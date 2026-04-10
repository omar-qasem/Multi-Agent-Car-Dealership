import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  MessageSquare, Users, Clock, TrendingUp, Bot, Zap,
  RefreshCw, AlertCircle, Calendar, Car, Wrench, Building2,
  ClipboardList, ShoppingCart, AlertTriangle, CheckCircle,
  ArrowLeft, Activity
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import StatCard from '../components/StatCard';
import { useSocket } from '../context/SocketContext';

const COLORS = ['#25D366', '#128C7E', '#34D399', '#059669', '#6EE7B7', '#A7F3D0'];

const formatDate = (dateStr) => {
  try {
    return new Date(dateStr).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
};

// ===== OPS CARD =====
function OpsCard({ icon: Icon, label, value, color, alert, onClick, linkTo }) {
  const base = `flex flex-col gap-1 p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${
    alert
      ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
      : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
  }`;
  return (
    <div className={base} onClick={onClick}>
      <div className="flex items-center justify-between">
        <Icon size={18} className={alert ? 'text-red-500' : color} />
        {alert && <AlertTriangle size={14} className="text-red-500" />}
      </div>
      <div className={`text-2xl font-bold ${alert ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// ===== ALERT BANNER =====
function AlertBanner({ type, message, onClick }) {
  const styles = {
    warning: 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300',
    danger:  'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300',
    info:    'bg-blue-50 dark:bg-blue-900/10 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300',
  };
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium cursor-pointer ${styles[type]}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        {message}
      </div>
      <ArrowLeft size={14} />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [liveStats, setLiveStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const socket = useSocket();

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get('/api/analytics');
      setAnalytics(res.data.data);
      setLastUpdate(new Date());
    } catch (err) {
      setError('فشل تحميل بيانات التحليلات.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLiveStats = useCallback(async () => {
    try {
      setLiveLoading(true);
      const res = await axios.get('/api/manage/live-stats');
      setLiveStats(res.data.data);
    } catch (err) {
      console.error('live-stats error:', err);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchLiveStats();

    const analyticsInterval = setInterval(fetchAnalytics, 60 * 1000); // every 60s
    const liveInterval = setInterval(fetchLiveStats, 15 * 1000); // every 15s

    return () => {
      clearInterval(analyticsInterval);
      clearInterval(liveInterval);
    };
  }, [fetchAnalytics, fetchLiveStats]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = () => { fetchAnalytics(); fetchLiveStats(); };
    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket, fetchAnalytics, fetchLiveStats]);

  const handleRefresh = () => { fetchAnalytics(); fetchLiveStats(); };

  const ls = liveStats || {};
  const todayStats = analytics?.todayStats || {};
  const weekStats = analytics?.weekStats || {};

  // Build alerts list
  const alerts = [];
  if (ls.bookings_pending > 0)
    alerts.push({ type: 'warning', msg: `${ls.bookings_pending} حجز بانتظار التأكيد`, path: '/bookings' });
  if (ls.tickets_open > 0)
    alerts.push({ type: 'danger', msg: `${ls.tickets_open} تذاكر دعم مفتوحة`, path: '/tickets' });
  if (ls.parts_out_of_stock > 0)
    alerts.push({ type: 'danger', msg: `${ls.parts_out_of_stock} قطعة نفدت من المخزون`, path: '/parts' });
  if (ls.parts_low_stock > 0)
    alerts.push({ type: 'warning', msg: `${ls.parts_low_stock} قطعة على وشك النفاد`, path: '/parts' });
  if (ls.inquiries_new > 0)
    alerts.push({ type: 'info', msg: `${ls.inquiries_new} استفسار شراء جديد من العملاء`, path: '/inquiries' });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-red-500 text-center">{error}</p>
        <button onClick={fetchAnalytics} className="btn-primary flex items-center gap-2">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🏠 لوحة التحكم</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {lastUpdate ? `آخر تحديث: ${lastUpdate.toLocaleTimeString('ar-SA')}` : 'جاري التحميل...'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || liveLoading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={(loading || liveLoading) ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ===== ALERTS ===== */}
      {!liveLoading && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner
              key={i}
              type={a.type}
              message={a.msg}
              onClick={() => navigate(a.path)}
            />
          ))}
        </div>
      )}

      {/* ===== WHATSAPP STATS ===== */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <MessageSquare size={14} />
          إحصائيات واتساب
        </h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="رسائل اليوم"
            value={loading ? '...' : (todayStats.total || ls.conversations_today || 0)}
            subtitle={`${weekStats.total || 0} هذا الأسبوع`}
            icon={MessageSquare}
            color="green"
            loading={loading}
          />
          <StatCard
            title="متوسط وقت الرد"
            value={loading ? '...' : `${((analytics?.avgResponseTime || 0) / 1000).toFixed(1)}ث`}
            subtitle="للرد الذكي"
            icon={Clock}
            color="blue"
            loading={loading}
          />
          <StatCard
            title="عملاء فريدون"
            value={loading ? '...' : (analytics?.uniqueCustomers || ls.total_customers || 0)}
            subtitle="إجمالي العملاء"
            icon={Users}
            color="purple"
            loading={loading}
          />
          <StatCard
            title="معدل التصعيد"
            value={loading ? '...' : `${analytics?.escalationRate || 0}%`}
            subtitle="تحويل للدعم البشري"
            icon={TrendingUp}
            color="orange"
            loading={loading}
          />
        </div>
      </div>

      {/* ===== OPERATIONS CENTER ===== */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} />
          مركز العمليات
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <OpsCard
            icon={Calendar}
            label="مواعيد اليوم"
            value={liveLoading ? '...' : (ls.bookings_today ?? 0)}
            color="text-blue-500"
            onClick={() => navigate('/bookings')}
          />
          <OpsCard
            icon={AlertCircle}
            label="حجوزات بانتظار"
            value={liveLoading ? '...' : (ls.bookings_pending ?? 0)}
            color="text-yellow-500"
            alert={!liveLoading && ls.bookings_pending > 0}
            onClick={() => navigate('/bookings')}
          />
          <OpsCard
            icon={Car}
            label="سيارات متاحة"
            value={liveLoading ? '...' : (ls.cars_available ?? 0)}
            color="text-green-500"
            onClick={() => navigate('/cars')}
          />
          <OpsCard
            icon={Wrench}
            label="قطع ناقصة"
            value={liveLoading ? '...' : ((ls.parts_low_stock ?? 0) + (ls.parts_out_of_stock ?? 0))}
            color="text-orange-500"
            alert={!liveLoading && (ls.parts_out_of_stock > 0 || ls.parts_low_stock > 0)}
            onClick={() => navigate('/parts')}
          />
          <OpsCard
            icon={ClipboardList}
            label="تذاكر مفتوحة"
            value={liveLoading ? '...' : (ls.tickets_open ?? 0)}
            color="text-red-500"
            alert={!liveLoading && ls.tickets_open > 0}
            onClick={() => navigate('/tickets')}
          />
          <OpsCard
            icon={ShoppingCart}
            label="استفسارات جديدة"
            value={liveLoading ? '...' : (ls.inquiries_new ?? 0)}
            color="text-indigo-500"
            alert={!liveLoading && ls.inquiries_new > 0}
            onClick={() => navigate('/inquiries')}
          />
        </div>
      </div>

      {/* ===== CHARTS ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Daily Messages Chart */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap size={18} className="text-green-500" />
              الرسائل اليومية (آخر 30 يوم)
            </h2>
          </div>
          <div className="h-64">
            {loading ? (
              <div className="h-full bg-gray-50 dark:bg-gray-700 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics?.dailyMessages || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    labelFormatter={(l) => formatDate(l)}
                    formatter={(v) => [v, 'رسائل']}
                    contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '12px', fontFamily: 'Tajawal' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#25D366" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#25D366' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Topic Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
            <Bot size={18} className="text-blue-500" />
            توزيع المواضيع
          </h2>
          <div className="h-48">
            {loading ? (
              <div className="h-full bg-gray-50 dark:bg-gray-700 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics?.topicDistribution || []}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={75}
                    paddingAngle={3} dataKey="value"
                  >
                    {(analytics?.topicDistribution || []).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [v, n]}
                    contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '12px', fontFamily: 'Tajawal' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {(analytics?.topicDistribution || []).slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                </div>
                <span className="font-medium text-gray-700 dark:text-gray-300">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== QUICK INVENTORY OVERVIEW ===== */}
      {!liveLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cars */}
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate('/cars')}
          >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
              <Car size={14} /> المخزون - سيارات
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'متاحة', val: ls.cars_available, color: 'text-green-600 dark:text-green-400' },
                { label: 'محجوزة', val: ls.cars_reserved, color: 'text-yellow-600 dark:text-yellow-400' },
                { label: 'مباعة', val: ls.cars_sold, color: 'text-gray-500' },
              ].map(s => (
                <div key={s.label}>
                  <div className={`text-xl font-bold ${s.color}`}>{s.val ?? 0}</div>
                  <div className="text-xs text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tickets */}
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate('/tickets')}
          >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
              <ClipboardList size={14} /> تذاكر الدعم
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'مفتوحة', val: ls.tickets_open, color: 'text-red-600 dark:text-red-400' },
                { label: 'قيد العمل', val: ls.tickets_in_progress, color: 'text-yellow-600 dark:text-yellow-400' },
                { label: 'محلولة', val: ls.tickets_resolved, color: 'text-green-600 dark:text-green-400' },
              ].map(s => (
                <div key={s.label}>
                  <div className={`text-xl font-bold ${s.color}`}>{s.val ?? 0}</div>
                  <div className="text-xs text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Inquiries */}
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate('/inquiries')}
          >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
              <ShoppingCart size={14} /> استفسارات الشراء
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'جديد', val: ls.inquiries_new, color: 'text-indigo-600 dark:text-indigo-400' },
                { label: 'تواصل', val: ls.inquiries_contacted, color: 'text-blue-600 dark:text-blue-400' },
                { label: 'مؤهل', val: ls.inquiries_qualified, color: 'text-green-600 dark:text-green-400' },
              ].map(s => (
                <div key={s.label}>
                  <div className={`text-xl font-bold ${s.color}`}>{s.val ?? 0}</div>
                  <div className="text-xs text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== PEAK HOURS ===== */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
          <Clock size={18} className="text-orange-500" />
          ساعات الذروة
        </h2>
        <div className="h-48">
          {loading ? (
            <div className="h-full bg-gray-50 dark:bg-gray-700 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.hourlyDistribution || []} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  formatter={(v) => [v, 'رسائل']}
                  contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #e5e7eb', borderRadius: '12px', fontFamily: 'Tajawal' }}
                />
                <Bar dataKey="count" fill="#25D366" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
