import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  MapPin, Phone, Clock, Car, Calendar,
  Users, CheckCircle, AlertCircle, RefreshCw,
  Building2, Wrench, Tag, BarChart3
} from 'lucide-react';

const BRANCH_ICONS = {
  'عمان': '🏙️',
  'إربد': '🌿',
  'الزرقاء': '🏭',
  'العقبة': '🌊',
};

const TODAY_HOURS = [
  '9:00 ص', '9:30 ص', '10:00 ص', '10:30 ص',
  '11:00 ص', '11:30 ص', '12:00 م', '12:30 م',
  '1:00 م', '2:00 م', '3:00 م', '4:00 م',
  '5:00 م', '6:00 م',
];

function StatPill({ icon: Icon, label, value, color }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${color}`}>
      <Icon size={15} className="flex-shrink-0" />
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-xs opacity-75 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function BranchCard({ branch, bookings }) {
  const branchBookings = bookings.filter(b =>
    b.branch === branch.name ||
    b.branch === branch.name.split(' ')[0]
  );
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = branchBookings.filter(b => b.preferred_date === today);
  const pendingCount = branchBookings.filter(b => b.status === 'pending').length;
  const confirmedCount = branchBookings.filter(b => b.status === 'confirmed').length;

  // Compute slot availability for today
  const bookedTimes = todayBookings
    .filter(b => b.status !== 'cancelled')
    .map(b => b.preferred_time);

  const availableSlots = TODAY_HOURS.filter(h => !bookedTimes.includes(h));

  const branchKey = branch.name.split(' ')[0];
  const emoji = BRANCH_ICONS[branchKey] || '🏢';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
      {/* Header */}
      <div className="bg-gradient-to-l from-green-500/10 to-green-600/5 dark:from-green-900/20 dark:to-green-900/10 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {emoji} فرع {branch.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              <MapPin size={14} className="text-green-500" />
              {branch.address}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 justify-end">
              <Phone size={14} className="text-green-500" />
              <span dir="ltr">{branch.phone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 divide-x divide-x-reverse divide-gray-100 dark:divide-gray-700 p-0">
        {[
          { label: 'اليوم', value: todayBookings.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/10' },
          { label: 'بانتظار', value: pendingCount, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/10' },
          { label: 'مؤكدة', value: confirmedCount, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/10' },
          { label: 'الكل', value: branchBookings.length, color: 'text-gray-600 dark:text-gray-400', bg: '' },
        ].map(s => (
          <div key={s.label} className={`flex flex-col items-center justify-center py-4 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Today's Bookings */}
      <div className="p-5 space-y-4">
        {/* Availability Grid */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Clock size={15} className="text-blue-500" />
            أوقات اليوم ({today})
          </h4>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {TODAY_HOURS.map(h => {
              const isBooked = bookedTimes.includes(h);
              return (
                <div
                  key={h}
                  className={`px-1.5 py-1 rounded-lg text-center text-xs font-medium transition-all ${
                    isBooked
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  }`}
                  title={isBooked ? 'محجوز' : 'متاح'}
                >
                  {h}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/20 inline-block"></span> متاح ({availableSlots.length})</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 inline-block"></span> محجوز ({bookedTimes.length})</span>
          </div>
        </div>

        {/* Today's Appointments List */}
        {todayBookings.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Calendar size={15} className="text-purple-500" />
              مواعيد اليوم
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {todayBookings
                .sort((a, b) => (a.preferred_time || '').localeCompare(b.preferred_time || ''))
                .map(b => (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex-shrink-0 w-16 text-center">
                        {b.preferred_time || '--'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{b.customer_name}</p>
                        <p className="text-xs text-gray-400 truncate">{b.service_type}</p>
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      b.status === 'confirmed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : b.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : b.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {b.status === 'confirmed' ? 'مؤكد' : b.status === 'completed' ? 'مكتمل' : b.status === 'cancelled' ? 'ملغي' : 'انتظار'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Hours & Services */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <Clock size={13} /> أوقات الدوام
            </p>
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex justify-between">
                <span>أيام الأسبوع</span>
                <span className="font-medium">{branch.hours_weekday}</span>
              </div>
              <div className="flex justify-between">
                <span>الجمعة</span>
                <span className="font-medium">{branch.hours_friday}</span>
              </div>
              <div className="flex justify-between">
                <span>السبت</span>
                <span className="font-medium">{branch.hours_saturday}</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <Wrench size={13} /> الخدمات
            </p>
            <div className="flex flex-wrap gap-1">
              {(branch.services || []).map((s, i) => (
                <span key={i} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-lg text-xs">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [branchRes, bookingRes] = await Promise.all([
        axios.get('/api/manage/branches'),
        axios.get('/api/manage/bookings'),
      ]);
      setBranches(branchRes.data.data || []);
      setBookings(bookingRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Summary stats
  const totalToday = bookings.filter(b => b.preferred_date === selectedDate && b.status !== 'cancelled').length;
  const totalPending = bookings.filter(b => b.status === 'pending').length;
  const totalConfirmed = bookings.filter(b => b.status === 'confirmed').length;
  const totalAll = bookings.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🏢 الأفرع والجداول</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">متابعة مواعيد وجداول جميع الأفرع</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="input-field text-sm w-auto"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2 !px-4 !py-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Calendar,     label: `مواعيد ${selectedDate === new Date().toISOString().split('T')[0] ? 'اليوم' : 'اليوم المحدد'}`, val: totalToday,     color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
          { icon: AlertCircle,  label: 'بانتظار التأكيد', val: totalPending,   color: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' },
          { icon: CheckCircle,  label: 'مؤكدة',           val: totalConfirmed, color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
          { icon: BarChart3,    label: 'إجمالي الحجوزات', val: totalAll,       color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
              <Icon size={24} className="mb-2 opacity-70" />
              <div className="text-3xl font-bold">{s.val}</div>
              <div className="text-sm mt-1 opacity-80">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Branch Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {branches.map(b => (
            <BranchCard
              key={b.id}
              branch={b}
              bookings={bookings.filter(bk => bk.preferred_date === selectedDate || bk.status === 'pending' || bk.status === 'confirmed')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
