import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ShoppingCart, RefreshCw, AlertCircle, Search,
  ChevronDown, Phone, User, Car, DollarSign,
  CheckCircle, MessageSquare, Edit3, X, Save,
  ArrowRight, Clock, Tag
} from 'lucide-react';

// ── Status pipeline ─────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'new',       label: 'جديد',      color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', dot: 'bg-indigo-500' },
  { key: 'contacted', label: 'تم التواصل',color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-500' },
  { key: 'qualified', label: 'مؤهل',      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-500' },
  { key: 'closed',    label: 'مغلق',      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',   dot: 'bg-green-500' },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.new;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Pipeline steps ──────────────────────────────────────────────────────────
function PipelineSteps({ currentStatus, onStep, saving }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUSES.map((s, i) => {
        const steps  = STATUSES.map(x => x.key);
        const curIdx = steps.indexOf(currentStatus);
        const sIdx   = steps.indexOf(s.key);
        const isDone = sIdx <= curIdx;
        const isNext = sIdx === curIdx + 1;
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => !isDone && onStep(s.key)}
              disabled={isDone || saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isDone
                  ? `${s.color} opacity-80 cursor-default`
                  : isNext
                    ? `${s.color} hover:opacity-90 cursor-pointer ring-2 ring-offset-1 ring-current`
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isDone && <CheckCircle size={11} />}
              {s.label}
            </button>
            {i < STATUSES.length - 1 && (
              <ArrowRight size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Inquiry Card ────────────────────────────────────────────────────────────
function InquiryCard({ inquiry, onUpdate }) {
  const [expanded, setExpanded]   = useState(false);
  const [editing,  setEditing]    = useState(false);
  const [note,     setNote]       = useState(inquiry.notes || '');
  const [saving,   setSaving]     = useState(false);

  const handleStep = async (newStatus) => {
    setSaving(true);
    await onUpdate(inquiry.id, { status: newStatus });
    setSaving(false);
  };

  const handleSaveNote = async () => {
    setSaving(true);
    await onUpdate(inquiry.id, { notes: note });
    setSaving(false);
    setEditing(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  };

  const statusMeta = STATUS_MAP[inquiry.status] || STATUS_MAP.new;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-all">

      {/* ─ header ─ */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
        onClick={() => setExpanded(e => !e)}
      >
        {/* status stripe */}
        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${statusMeta.dot}`} />

        {/* id */}
        <div className="hidden sm:flex flex-col min-w-[80px]">
          <span className="text-xs font-mono text-gray-400">{inquiry.id}</span>
          <span className="text-xs text-gray-300 dark:text-gray-500">{formatTime(inquiry.created_at)}</span>
        </div>

        {/* customer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{inquiry.customer_name || 'عميل'}</span>
            {inquiry.customer_phone && (
              <span className="text-xs text-gray-400 font-mono">{inquiry.customer_phone}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            {(inquiry.car_make || inquiry.car_model) && (
              <span className="flex items-center gap-1">
                <Car size={11} />
                {[inquiry.car_make, inquiry.car_model].filter(Boolean).join(' ')}
              </span>
            )}
            {inquiry.budget && (
              <span className="flex items-center gap-1">
                <DollarSign size={11} />
                ميزانية {Number(inquiry.budget).toLocaleString()} دينار
              </span>
            )}
          </div>
        </div>

        {/* status badge + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={inquiry.status} />
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* ─ expanded ─ */}
      {expanded && (
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-4">

          {/* details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              { label: 'العميل',  val: inquiry.customer_name, icon: User },
              { label: 'الهاتف',  val: inquiry.customer_phone, icon: Phone },
              { label: 'السيارة', val: [inquiry.car_make, inquiry.car_model].filter(Boolean).join(' ') || '—', icon: Car },
              { label: 'الميزانية', val: inquiry.budget ? `${Number(inquiry.budget).toLocaleString()} دينار` : 'غير محدد', icon: DollarSign },
              { label: 'تاريخ', val: formatTime(inquiry.created_at), icon: Clock },
              { label: 'الحالة', val: STATUS_MAP[inquiry.status]?.label || inquiry.status, icon: Tag },
            ].map(({ label, val, icon: Icon }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Icon size={11} />
                  {label}
                </div>
                <div className="font-medium text-gray-700 dark:text-gray-200 text-sm">{val || '—'}</div>
              </div>
            ))}
          </div>

          {/* original notes */}
          {inquiry.notes && !editing && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">ملاحظات / تفاصيل</p>
              <p className="text-sm text-blue-800 dark:text-blue-300">{inquiry.notes}</p>
            </div>
          )}

          {/* pipeline progress */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">مسار المتابعة</p>
            <PipelineSteps currentStatus={inquiry.status} onStep={handleStep} saving={saving} />
          </div>

          {/* note edit */}
          {editing ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500">ملاحظات الموظف</label>
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="أضف ملاحظات المتابعة..."
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm resize-none
                           bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  حفظ
                </button>
                <button
                  onClick={() => { setEditing(false); setNote(inquiry.notes || ''); }}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Edit3 size={12} />
              {inquiry.notes ? 'تعديل الملاحظات' : 'إضافة ملاحظة'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function PurchaseInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [stats,     setStats]     = useState({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState('');
  const [statusF,   setStatusF]   = useState('');

  const fetchInquiries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (statusF) params.status = statusF;
      if (search)  params.search = search;
      const res = await axios.get('/api/manage/inquiries', { params });
      setInquiries(res.data.data || []);
      setStats(res.data.stats || {});
    } catch (err) {
      setError('فشل تحميل الاستفسارات.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusF, search]);

  useEffect(() => {
    const t = setTimeout(fetchInquiries, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchInquiries, search]);

  const handleUpdate = async (id, data) => {
    try {
      await axios.put(`/api/manage/inquiries/${id}`, data);
      await fetchInquiries();
    } catch {
      alert('فشل التحديث');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart size={24} className="text-indigo-500" />
            استفسارات الشراء
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            إدارة العملاء المهتمين بشراء سيارة
          </p>
        </div>
        <button
          onClick={fetchInquiries}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ─── Pipeline Stats ─── */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(s => (
          <div
            key={s.key}
            onClick={() => setStatusF(statusF === s.key ? '' : s.key)}
            className={`rounded-2xl px-3 py-3 text-center cursor-pointer transition-all border-2 ${
              statusF === s.key
                ? 'border-current ' + s.color
                : 'border-transparent bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
            }`}
          >
            <div className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>
              {stats[s.key] || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف أو السيارة..."
            className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                       bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200
                       focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={statusF}
          onChange={e => setStatusF(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">كل الحالات</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* ─── Content ─── */}
      {error ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={fetchInquiries} className="btn-primary text-sm">إعادة المحاولة</button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 animate-pulse" />)}
        </div>
      ) : inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <ShoppingCart size={48} />
          <p className="text-sm">لا توجد استفسارات مطابقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{inquiries.length} استفسار</p>
          {inquiries.map(inq => (
            <InquiryCard key={inq.id} inquiry={inq} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
