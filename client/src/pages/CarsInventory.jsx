import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Car, Plus, Edit3, Trash2, Search, RefreshCw,
  CheckCircle, XCircle, Clock, Tag, MapPin, Gauge, Settings
} from 'lucide-react';

const STATUS_CONFIG = {
  available: { label: 'متاحة',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  reserved:  { label: 'محجوزة', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  sold:      { label: 'مبيعة',  color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const CONDITION_CONFIG = {
  new:  { label: 'جديدة',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  used: { label: 'مستعملة',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const BRANCHES = ['عمان', 'إربد', 'الزرقاء', 'العقبة'];
const MAKES = ['Toyota', 'Hyundai', 'Kia', 'MG', 'Nissan', 'BMW', 'Mercedes', 'Honda', 'Chery', 'Mitsubishi'];
const FUEL_TYPES = ['بنزين', 'هجين', 'كهربائي', 'ديزل'];
const TRANSMISSIONS = ['أوتوماتيك', 'يدوي'];

const emptyForm = {
  make: '', model: '', year: new Date().getFullYear(), color: '',
  price: '', mileage: 0, condition: 'new', status: 'available',
  branch: 'عمان', features: '', fuel_type: 'بنزين',
  transmission: 'أوتوماتيك', engine: '',
};

function CarModal({ car, onClose, onSave }) {
  const [form, setForm] = useState(car || emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (car) {
        await axios.put(`/api/manage/cars/${car.id}`, form);
      } else {
        await axios.post('/api/manage/cars', form);
      }
      onSave();
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {car ? '✏️ تعديل سيارة' : '➕ إضافة سيارة جديدة'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الماركة *</label>
              <select className="input-field text-sm" value={form.make} onChange={e => set('make', e.target.value)} required>
                <option value="">اختر...</option>
                {MAKES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الموديل *</label>
              <input className="input-field text-sm" value={form.model} onChange={e => set('model', e.target.value)} required placeholder="مثال: Camry" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">سنة الصنع *</label>
              <input type="number" className="input-field text-sm" value={form.year} onChange={e => set('year', parseInt(e.target.value))} required min="2000" max="2030" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">اللون</label>
              <input className="input-field text-sm" value={form.color} onChange={e => set('color', e.target.value)} placeholder="مثال: أبيض لؤلؤي" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">السعر (دينار) *</label>
              <input type="number" className="input-field text-sm" value={form.price} onChange={e => set('price', parseFloat(e.target.value))} required min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الكيلومترات</label>
              <input type="number" className="input-field text-sm" value={form.mileage} onChange={e => set('mileage', parseInt(e.target.value))} min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الحالة</label>
              <select className="input-field text-sm" value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="new">جديدة</option>
                <option value="used">مستعملة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الحالة التشغيلية</label>
              <select className="input-field text-sm" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="available">متاحة</option>
                <option value="reserved">محجوزة</option>
                <option value="sold">مبيعة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الفرع *</label>
              <select className="input-field text-sm" value={form.branch} onChange={e => set('branch', e.target.value)}>
                {BRANCHES.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">نوع الوقود</label>
              <select className="input-field text-sm" value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
                {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ناقل الحركة</label>
              <select className="input-field text-sm" value={form.transmission} onChange={e => set('transmission', e.target.value)}>
                {TRANSMISSIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">المحرك</label>
              <input className="input-field text-sm" value={form.engine} onChange={e => set('engine', e.target.value)} placeholder="مثال: 2.5L" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">المميزات</label>
            <textarea className="input-field text-sm" rows={2} value={form.features} onChange={e => set('features', e.target.value)} placeholder="مثال: كاميرا خلفية، شاشة لمس، كروز كنترول..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'جاري الحفظ...' : (car ? 'حفظ التعديلات' : 'إضافة السيارة')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CarCard({ car, onEdit, onDelete, onStatusChange }) {
  const statusCfg = STATUS_CONFIG[car.status] || STATUS_CONFIG.available;
  const conditionCfg = CONDITION_CONFIG[car.condition] || CONDITION_CONFIG.new;
  const [changingStatus, setChangingStatus] = useState(false);

  const quickStatus = async (newStatus) => {
    setChangingStatus(true);
    try {
      await axios.put(`/api/manage/cars/${car.id}`, { status: newStatus });
      onStatusChange();
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-all">
      {/* Top Row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
            {car.make} {car.model}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{car.year} • {car.color}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${conditionCfg.color}`}>{conditionCfg.label}</span>
        </div>
      </div>

      {/* Price */}
      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
        {car.price?.toLocaleString()} <span className="text-sm font-normal text-gray-400">د.أ</span>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-gray-400" />
          {car.branch}
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge size={13} className="text-gray-400" />
          {car.fuel_type}
        </div>
        <div className="flex items-center gap-1.5">
          <Settings size={13} className="text-gray-400" />
          {car.transmission}
        </div>
        {car.mileage > 0 && (
          <div className="flex items-center gap-1.5">
            <Car size={13} className="text-gray-400" />
            {car.mileage?.toLocaleString()} كم
          </div>
        )}
      </div>

      {/* Features */}
      {car.features && (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{car.features}</p>
      )}

      {/* Quick Status */}
      <div className="flex gap-2">
        {car.status !== 'available' && (
          <button onClick={() => quickStatus('available')} disabled={changingStatus}
            className="flex-1 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/40 transition-all">
            ← متاحة
          </button>
        )}
        {car.status !== 'reserved' && (
          <button onClick={() => quickStatus('reserved')} disabled={changingStatus}
            className="flex-1 py-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 text-xs font-medium hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-all">
            ← محجوزة
          </button>
        )}
        {car.status !== 'sold' && (
          <button onClick={() => quickStatus('sold')} disabled={changingStatus}
            className="flex-1 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-all">
            ← مبيعة
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        <button onClick={() => onEdit(car)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm transition-all">
          <Edit3 size={15} /> تعديل
        </button>
        <button onClick={() => onDelete(car)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm transition-all">
          <Trash2 size={15} /> حذف
        </button>
      </div>
    </div>
  );
}

export default function CarsInventory() {
  const [cars, setCars] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingCar, setEditingCar] = useState(null);

  const fetchCars = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/manage/cars');
      setCars(res.data.data || []);
      setStats(res.data.stats || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCars(); }, [fetchCars]);

  const handleDelete = async (car) => {
    if (!confirm(`هل تريد حذف ${car.make} ${car.model} ${car.year}؟`)) return;
    try {
      await axios.delete(`/api/manage/cars/${car.id}`);
      fetchCars();
    } catch { alert('فشل الحذف'); }
  };

  const handleEdit = (car) => { setEditingCar(car); setShowModal(true); };
  const handleAdd = () => { setEditingCar(null); setShowModal(true); };

  const filtered = cars.filter(c => {
    if (filterBranch !== 'الكل' && c.branch !== filterBranch) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterCondition !== 'all' && c.condition !== filterCondition) return false;
    if (search) {
      const s = search.toLowerCase();
      return c.make?.toLowerCase().includes(s) || c.model?.toLowerCase().includes(s) || c.color?.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🚗 مخزون السيارات</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إدارة كاملة لجميع السيارات في المعرض</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchCars} className="btn-secondary flex items-center gap-2 !px-4 !py-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleAdd} className="btn-primary flex items-center gap-2 !px-4 !py-2">
            <Plus size={16} /> إضافة سيارة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'الإجمالي',  val: stats.total,     color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
          { label: 'متاحة',    val: stats.available,  color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { label: 'محجوزة',   val: stats.reserved,   color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
          { label: 'مبيعة',    val: stats.sold,       color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
          { label: 'جديدة',    val: stats.new,        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
          { label: 'مستعملة',  val: stats.used,       color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="text-2xl font-bold">{s.val || 0}</div>
            <div className="text-xs mt-0.5 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pr-9 text-sm" placeholder="بحث بالماركة أو الموديل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input-field text-sm" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
            <option>الكل</option>
            {BRANCHES.map(b => <option key={b}>{b}</option>)}
          </select>
          <select className="input-field text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            <option value="available">متاحة</option>
            <option value="reserved">محجوزة</option>
            <option value="sold">مبيعة</option>
          </select>
          <select className="input-field text-sm" value={filterCondition} onChange={e => setFilterCondition(e.target.value)}>
            <option value="all">جديدة ومستعملة</option>
            <option value="new">جديدة فقط</option>
            <option value="used">مستعملة فقط</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-2">يعرض {filtered.length} من {cars.length} سيارة</p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Car size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">لا توجد سيارات</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CarCard key={c.id} car={c} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={fetchCars} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CarModal car={editingCar} onClose={() => setShowModal(false)} onSave={fetchCars} />
      )}
    </div>
  );
}
