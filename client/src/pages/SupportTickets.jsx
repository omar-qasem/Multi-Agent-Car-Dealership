import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ClipboardList, RefreshCw, AlertCircle, Search,
  ChevronDown, Clock, User, Phone, AlertTriangle,
  CheckCircle, MessageSquare, Filter, Edit3, X, Save
} from 'lucide-react';

// ── Priority badge ──────────────────────────────────────────────────────────
const PRIORITY = {
  high:   { label: 'عاجل',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',    dot: 'bg-red-500' },
  medium: { label: 'متوسط',  cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:    { label: 'منخفض',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',   dot: 'bg-gray-400' },
};

// ── Status config ───────────────────────────────────────────────────────────
const STATUS = {
  open:        { label: 'مفتوح',      cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  in_progress: { label: 'قيد العمل',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  resolved:    { label: 'محلول',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${p.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.open;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Ticket Row ──────────────────────────────────────────────────────────────
function TicketRow({ ticket, onStatusChange }) {
  const [expanded, setExpanded]   = useState(false);
  const [editing,  setEditing]    = useState(false);
  const [note,     setNote]       = useState(ticket.resolution_note || '');
  const [saving,   setSaving]     = useState(false);
  const [newStatus, setNewStatus] = useState(ticket.status);

  const handleSave = async () => {
    setSaving(true);
    await onStatusChange(ticket.id, newStatus, note);
    setSaving(false);
    setEditing(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  };

  const priorityMeta = PRIORITY[ticket.priority] || PRIORITY.medium;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      ticket.priority === 'high' && ticket.status === 'open'
        ? 'border-red-200 dark:border-red-800'
        : 'border-gray-100 dark:border-gray-700'
    } bg-white dark:bg-gray-800`}>

      {/* ─ header row ─ */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* priority stripe */}
        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${priorityMeta.dot}`} />

        {/* id + time */}
        <div className="hidden sm:flex flex-col min-w-[90px]">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{ticket.id}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(ticket.created_at)}</span>
        </div>

        {/* customer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">
              {ticket.customer_name || 'عميل'}
            </span>
            {ticket.customer_phone && (
              <span className="text-xs text-gray-400 font-mono">{ticket.customer_phone}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{ticket.issue_description}</p>
        </div>

        {/* badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* ─ expanded details ─ */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-4">

          {/* description */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">وصف المشكلة</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{ticket.issue_description}</p>
          </div>

          {/* existing note */}
          {ticket.resolution_note && !editing && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">ملاحظة الموظف</p>
              <p className="text-sm text-blue-800 dark:text-blue-300">{ticket.resolution_note}</p>
            </div>
          )}

          {/* edit form */}
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">تغيير الحالة</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm
                             bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="open">مفتوح</option>
                  <option value="in_progress">قيد العمل</option>
                  <option value="resolved">محلول</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">ملاحظة / حل</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="اكتب ملاحظة أو وصف الحل..."
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm resize-none
                             bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  حفظ
                </button>
                <button
                  onClick={() => { setEditing(false); setNewStatus(ticket.status); setNote(ticket.resolution_note || ''); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm transition-colors"
                >
                  <X size={14} /> إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {ticket.status !== 'resolved' && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Edit3 size={12} /> تحديث الحالة
                </button>
              )}
              {ticket.status === 'open' && (
                <button
                  onClick={() => onStatusChange(ticket.id, 'in_progress', '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-xs font-medium hover:bg-yellow-100 transition-colors"
                >
                  <Clock size={12} /> بدء العمل
                </button>
              )}
              {ticket.status !== 'resolved' && (
                <button
                  onClick={() => onStatusChange(ticket.id, 'resolved', note || 'تم الحل')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-100 transition-colors"
                >
                  <CheckCircle size={12} /> تم الحل
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function SupportTickets() {
  const [tickets,  setTickets]  = useState([]);
  const [stats,    setStats]    = useState({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [statusF,  setStatusF]  = useState('');
  const [priorityF,setPriorityF]= useState('');

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (statusF) params.status = statusF;
      const res = await axios.get('/api/manage/tickets', { params });
      setTickets(res.data.data || []);
      setStats(res.data.stats || {});
    } catch (err) {
      setError('فشل تحميل التذاكر. تحقق من الاتصال.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusF]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleStatusChange = async (id, status, note) => {
    try {
      await axios.put(`/api/manage/tickets/${id}`, { status, resolution_note: note });
      await fetchTickets();
    } catch (err) {
      alert('فشل تحديث التذكرة');
    }
  };

  // Client-side filters
  const filtered = tickets.filter(t => {
    if (priorityF && t.priority !== priorityF) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (t.customer_name || '').toLowerCase().includes(s) ||
        (t.customer_phone || '').includes(s) ||
        (t.issue_description || '').toLowerCase().includes(s) ||
        (t.id || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Sort: high priority + open first
  const sorted = [...filtered].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const statusOrder   = { open: 0, in_progress: 1, resolved: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
  });

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList size={24} className="text-red-500" />
            تذاكر الدعم
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            متابعة مشاكل العملاء والطلبات المعقدة
          </p>
        </div>
        <button
          onClick={fetchTickets}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'مفتوح',     val: stats.open || 0,        color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/10' },
          { label: 'قيد العمل', val: stats.in_progress || 0, color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-900/10' },
          { label: 'محلول',     val: stats.resolved || 0,    color: 'text-green-600 dark:text-green-400',bg: 'bg-green-50 dark:bg-green-900/10' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl px-4 py-3 text-center border border-transparent`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو التلفون أو وصف المشكلة..."
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
          <option value="open">مفتوح</option>
          <option value="in_progress">قيد العمل</option>
          <option value="resolved">محلول</option>
        </select>

        <select
          value={priorityF}
          onChange={e => setPriorityF(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">كل الأولويات</option>
          <option value="high">عاجل</option>
          <option value="medium">متوسط</option>
          <option value="low">منخفض</option>
        </select>
      </div>

      {/* ─── Content ─── */}
      {error ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={fetchTickets} className="btn-primary text-sm">إعادة المحاولة</button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <CheckCircle size={48} />
          <p className="text-sm">لا توجد تذاكر مطابقة للبحث</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            عرض {sorted.length} من {tickets.length} تذكرة — مرتبة حسب الأولوية والحالة
          </p>
          {sorted.map(t => (
            <TicketRow key={t.id} ticket={t} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
