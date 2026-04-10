import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Calendar, Clock, CheckCircle, XCircle, AlertCircle,
  RefreshCw, Search, Filter, ChevronDown, Car, User,
  MapPin, Phone, Wrench, MessageSquare
} from 'lucide-react';

const STATUS_CONFIG = {
  pending:   { label: 'بانتظار التأكيد', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: AlertCircle },
  confirmed: { label: 'مؤكد',           color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',   icon: CheckCircle },
  completed: { label: 'مكتمل',          color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  cancelled: { label: 'ملغي',           color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',        icon: XCircle },
};

const BRANCHES = ['الكل', 'عمان', 'إربد', 'الزرقاء', 'العقبة'];

function StatBadge({ count, label, color }) {
  return (
    <div className={`flex-1 min-w-0 rounded-xl p-4 ${color} bg-opacity-10 dark:bg-opacity-20`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function BookingCard({ booking, onStatusChange }) {
  const [updating, setUpdating] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const cfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  const handleStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await axios.put(`/api/manage/bookings/${booking.id}/status`, { status: newStatus, notes });
      onStatusChange();
      setShowNotes(false);
      setNotes('');
    } catch (err) {
      alert('فشل تحديث الحالة');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white text-lg">{booking.id}</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
              <Icon size={12} />
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(booking.created_at).toLocaleString('ar-SA')}
          </p>
        </div>
        <div className="text-left rtl:text-right">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{booking.preferred_date}</p>
          <p className="text-xs text-gray-400">{booking.preferred_time}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <User size={15} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{booking.customer_name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Phone size={15} className="text-gray-400 flex-shrink-0" />
          <span dir="ltr">{booking.customer_phone}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Car size={15} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{booking.car_make} {booking.car_model} {booking.car_year}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin size={15} className="text-gray-400 flex-shrink-0" />
          <span>{booking.branch}</span>
        </div>
      </div>

      {/* Service */}
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2 mb-4">
        <Wrench size={15} className="text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{booking.service_type}</span>
      </div>

      {/* Notes */}
      {booking.notes && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex gap-1.5">
          <MessageSquare size={13} className="flex-shrink-0 mt-0.5" />
          <span>{booking.notes}</span>
        </div>
      )}
      {booking.staff_notes && (
        <div className="text-xs text-blue-600 dark:text-blue-400 mb-3 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
          📋 ملاحظة الموظف: {booking.staff_notes}
        </div>
      )}

      {/* Actions */}
      {booking.status === 'pending' && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => handleStatus('confirmed')}
            disabled={updating}
            className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {updating ? '...' : '✓ تأكيد الموعد'}
          </button>
          <button
            onClick={() => setShowNotes(n => !n)}
            className="px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm transition-all"
          >
            إلغاء
          </button>
        </div>
      )}
      {booking.status === 'confirmed' && (
        <button
          onClick={() => handleStatus('completed')}
          disabled={updating}
          className="w-full py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-all disabled:opacity-50"
        >
          {updating ? '...' : '✓ إكمال الخدمة'}
        </button>
      )}
      {showNotes && (
        <div className="mt-3 space-y-2">
          <input
            className="input-field text-sm"
            placeholder="سبب الإلغاء (اختياري)..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={() => handleStatus('cancelled')} disabled={updating}
              className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-all disabled:opacity-50">
              تأكيد الإلغاء
            </button>
            <button onClick={() => setShowNotes(false)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterDate, setFilterDate] = useState('');

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterBranch !== 'الكل') params.branch = filterBranch;
      if (filterDate) params.date = filterDate;
      const res = await axios.get('/api/manage/bookings', { params });
      setBookings(res.data.data || []);
      setStats(res.data.stats || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterBranch, filterDate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const filtered = bookings.filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      b.customer_name?.toLowerCase().includes(s) ||
      b.customer_phone?.includes(s) ||
      b.id?.toLowerCase().includes(s) ||
      b.car_make?.toLowerCase().includes(s) ||
      b.car_model?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🗓️ الحجوزات والمواعيد</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إدارة مواعيد الصيانة لجميع الأفرع</p>
        </div>
        <button onClick={fetchBookings} className="btn-secondary flex items-center gap-2 !px-4 !py-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <StatBadge count={stats.total || 0}     label="الكل"           color="text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700" />
        <StatBadge count={stats.pending || 0}   label="بانتظار التأكيد" color="text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900" />
        <StatBadge count={stats.confirmed || 0} label="مؤكدة"           color="text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900" />
        <StatBadge count={stats.completed || 0} label="مكتملة"          color="text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900" />
        <StatBadge count={stats.cancelled || 0} label="ملغية"           color="text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900" />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pr-9 text-sm"
              placeholder="بحث باسم العميل أو رقم الحجز..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-field text-sm"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            <option value="pending">بانتظار التأكيد</option>
            <option value="confirmed">مؤكد</option>
            <option value="completed">مكتمل</option>
            <option value="cancelled">ملغي</option>
          </select>
          <select
            className="input-field text-sm"
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
          >
            {BRANCHES.map(b => <option key={b}>{b}</option>)}
          </select>
          <input
            type="date"
            className="input-field text-sm"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Calendar size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">لا توجد حجوزات</p>
          <p className="text-sm mt-1">سيظهر الحجز هنا بمجرد حجز العميل عبر واتساب</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(b => (
            <BookingCard key={b.id} booking={b} onStatusChange={fetchBookings} />
          ))}
        </div>
      )}
    </div>
  );
}
