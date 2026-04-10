import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Wrench, Plus, Edit3, Search, RefreshCw,
  AlertTriangle, Package, TrendingUp, TrendingDown, Tag
} from 'lucide-react';

const CATEGORIES = ['الكل', 'فلاتر', 'بطاريات', 'بريك', 'إطارات', 'شمعات', 'زيوت', 'أخرى'];

function StockBadge({ quantity }) {
  if (quantity === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">نفد المخزون</span>;
  if (quantity <= 5) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">مخزون منخفض</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">متوفر</span>;
}

function PartRow({ part, onEdit }) {
  const [qty, setQty] = useState(part.quantity);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveQty = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/manage/parts/${part.id}`, { quantity: parseInt(qty) });
      setEditing(false);
      onEdit();
    } catch { alert('فشل التحديث'); }
    finally { setSaving(false); }
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 dark:text-white">{part.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{part.part_number}</div>
      </td>
      <td className="px-4 py-3">
        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
          {part.category}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-48">
        <div className="flex flex-wrap gap-1">
          {(part.compatible || []).slice(0, 2).map((c, i) => (
            <span key={i} className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-xs">{c}</span>
          ))}
          {(part.compatible || []).length > 2 && (
            <span className="text-gray-400 text-xs px-1">+{part.compatible.length - 2}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
        {part.price} <span className="text-xs font-normal text-gray-400">د.أ</span>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number" min="0"
              className="w-20 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus
            />
            <button onClick={saveQty} disabled={saving}
              className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs transition-all disabled:opacity-50">
              {saving ? '...' : '✓'}
            </button>
            <button onClick={() => { setEditing(false); setQty(part.quantity); }}
              className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs transition-all">
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${part.quantity === 0 ? 'text-red-500' : part.quantity <= 5 ? 'text-yellow-500' : 'text-gray-900 dark:text-white'}`}>
              {part.quantity}
            </span>
            <StockBadge quantity={part.quantity} />
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{part.location}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => { setQty(part.quantity); setEditing(true); }}
            className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all" title="تعديل الكمية">
            <Edit3 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddPartModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', part_number: '', category: 'فلاتر',
    price: '', quantity: 0, location: '', compatible: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        quantity: parseInt(form.quantity),
        compatible: form.compatible.split('،').map(s => s.trim()).filter(Boolean),
      };
      await axios.post('/api/manage/parts', payload);
      onSave();
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || 'خطأ في الإضافة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">➕ إضافة قطعة جديدة</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">اسم القطعة *</label>
              <input className="input-field text-sm" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="مثال: فلتر زيت" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">رقم القطعة *</label>
              <input className="input-field text-sm" value={form.part_number} onChange={e => set('part_number', e.target.value)} required placeholder="مثال: OIL-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الفئة</label>
              <select className="input-field text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
                {['فلاتر', 'بطاريات', 'بريك', 'إطارات', 'شمعات', 'زيوت', 'أخرى'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">السعر (د.أ) *</label>
              <input type="number" className="input-field text-sm" value={form.price} onChange={e => set('price', e.target.value)} required min="0" step="0.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الكمية</label>
              <input type="number" className="input-field text-sm" value={form.quantity} onChange={e => set('quantity', e.target.value)} min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الموقع في المخزن</label>
              <input className="input-field text-sm" value={form.location} onChange={e => set('location', e.target.value)} placeholder="مثال: رف A1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">السيارات المتوافقة (مفصولة بفاصلة)</label>
            <input className="input-field text-sm" value={form.compatible} onChange={e => set('compatible', e.target.value)} placeholder="Toyota Camry، Hyundai Tucson..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'جاري الإضافة...' : 'إضافة القطعة'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PartsInventory() {
  const [parts, setParts] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchParts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/manage/parts');
      setParts(res.data.data || []);
      setStats(res.data.stats || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  const filtered = parts.filter(p => {
    if (filterCategory !== 'الكل' && p.category !== filterCategory) return false;
    if (filterLowStock && p.quantity > 5) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.name?.toLowerCase().includes(s) ||
        p.part_number?.toLowerCase().includes(s) ||
        p.compatible?.some(c => c.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔧 مخزون قطع الغيار</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إدارة المخزون وتتبع الكميات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchParts} className="btn-secondary flex items-center gap-2 !px-4 !py-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2 !px-4 !py-2">
            <Plus size={16} /> إضافة قطعة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">إجمالي الأصناف</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.low_stock || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">مخزون منخفض</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.out_of_stock || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">نفد المخزون</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Tag size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.categories || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">فئات</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pr-9 text-sm" placeholder="بحث باسم القطعة أو الرقم أو السيارة..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input-field text-sm w-auto" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-yellow-500" checked={filterLowStock} onChange={e => setFilterLowStock(e.target.checked)} />
            <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">مخزون منخفض فقط</span>
          </label>
          <span className="text-xs text-gray-400">{filtered.length} من {parts.length}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-right">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">القطعة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">الفئة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">متوافقة مع</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">السعر</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">الكمية</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">الموقع</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <Wrench size={36} className="mx-auto mb-2 opacity-30" />
                      <p>لا توجد قطع</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => <PartRow key={p.id} part={p} onEdit={fetchParts} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddPartModal onClose={() => setShowAddModal(false)} onSave={fetchParts} />
      )}
    </div>
  );
}
