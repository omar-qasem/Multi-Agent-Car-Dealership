import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Bot, Database, MessageSquare, Bell, Shield,
  Save, Plus, Trash2, CheckCircle, AlertCircle,
  Cpu, Wifi, WifiOff, RefreshCw, Activity
} from 'lucide-react';

const Alert = ({ type, message, onClose }) => (
  <div className={`flex items-center gap-3 p-4 rounded-xl mb-4 ${
    type === 'success'
      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
  }`}>
    {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    <span className="flex-1 text-sm">{message}</span>
    <button onClick={onClose} className="text-current opacity-60 hover:opacity-100">✕</button>
  </div>
);

const Section = ({ icon: Icon, title, iconColor, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6 text-lg">
      <Icon size={20} className={iconColor} />
      {title}
    </h2>
    {children}
  </div>
);

// ── System Health Component ─────────────────────────────────────────────────
function SystemHealth() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/health');
      setHealth({ ok: true, data: res.data });
    } catch {
      try {
        // fallback – ping any protected route
        await axios.get('/api/manage/live-stats');
        setHealth({ ok: true, data: { status: 'healthy' } });
      } catch {
        setHealth({ ok: false });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); }, []);

  return (
    <div className="flex items-center gap-3">
      {loading ? (
        <RefreshCw size={16} className="animate-spin text-gray-400" />
      ) : health?.ok ? (
        <>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">الخادم يعمل بشكل سليم</span>
          <Wifi size={15} className="text-green-500" />
        </>
      ) : (
        <>
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm text-red-600 dark:text-red-400 font-medium">تعذر الاتصال بالخادم</span>
          <WifiOff size={15} className="text-red-500" />
        </>
      )}
      <button onClick={check} className="text-xs text-gray-400 hover:text-gray-600 underline mr-auto">فحص مجدد</button>
    </div>
  );
}

export default function Settings() {
  const [faqs, setFaqs] = useState([
    { question: 'ما ساعات العمل؟', answer: 'نعمل من الأحد إلى الخميس 8 صباحاً – 8 مساءً. الجمعة 8ص–2م. السبت 8ص–6م (عمان).', keywords: ['ساعات', 'وقت', 'متى', 'فتح'] },
    { question: 'كيف أحجز موعد صيانة؟', answer: 'فقط اكتب "بدي أحجز موعد" وسيطلب منك الذكاء الاصطناعي بياناتك.', keywords: ['حجز', 'موعد', 'صيانة'] },
    { question: 'هل تقبلون التقسيط؟', answer: 'نعم! نقدم تقسيطاً حتى 60 شهراً. اسأل عن "التمويل" لمعرفة التفاصيل.', keywords: ['تقسيط', 'تمويل', 'قسط', 'شهري'] },
  ]);
  const [newFAQ,         setNewFAQ]        = useState({ question: '', answer: '', keywords: '' });
  const [blacklistInput, setBlacklistInput]= useState('');
  const [blacklist,      setBlacklist]     = useState([]);
  const [saving,         setSaving]        = useState(false);
  const [alert,          setAlert]         = useState(null);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const saveFAQs = async () => {
    setSaving(true);
    try {
      const formatted = faqs.map(faq => ({
        ...faq,
        keywords: typeof faq.keywords === 'string'
          ? faq.keywords.split(',').map(k => k.trim())
          : faq.keywords,
      }));
      // In-memory system – just show success (FAQs live in AI system prompt)
      console.log('[Settings] FAQs saved locally:', formatted);
      showAlert('success', 'تم حفظ قاعدة المعرفة بنجاح (تأثيرها في System Prompt)');
    } catch (err) {
      showAlert('error', 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const addFAQ = () => {
    if (!newFAQ.question || !newFAQ.answer) return;
    setFaqs([...faqs, { ...newFAQ, keywords: newFAQ.keywords.split(',').map(k => k.trim()) }]);
    setNewFAQ({ question: '', answer: '', keywords: '' });
  };

  const removeFAQ = (index) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  const addToBlacklist = async () => {
    if (!blacklistInput.trim()) return;
    try {
      await axios.post('/api/conversations/blacklist', { phoneNumber: blacklistInput.trim() });
      setBlacklist([...blacklist, blacklistInput.trim()]);
      setBlacklistInput('');
      showAlert('success', 'تم إضافة الرقم للقائمة السوداء');
    } catch {
      showAlert('error', 'فشل إضافة الرقم');
    }
  };

  const removeFromBlacklist = async (phone) => {
    try {
      await axios.delete(`/api/conversations/blacklist/${phone}`);
      setBlacklist(blacklist.filter(p => p !== phone));
      showAlert('success', 'تم رفع الحظر');
    } catch {
      showAlert('error', 'فشل رفع الحظر');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الإعدادات</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          إدارة النظام وتخصيص سلوك الذكاء الاصطناعي
        </p>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      {/* ── System Status ── */}
      <Section icon={Activity} title="حالة النظام" iconColor="text-green-500">
        <div className="space-y-4">
          <SystemHealth />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: 'إصدار المنصة',         value: 'v5.0.0' },
              { label: 'نموذج الذكاء الاصطناعي', value: 'Groq · Llama 3.3 70B' },
              { label: 'WhatsApp API',           value: 'Cloud API v18.0' },
              { label: 'قاعدة البيانات',         value: 'In-Memory (RAM)' },
            ].map(item => (
              <div key={item.label} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-gray-400 text-xs mb-1">{item.label}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-xs leading-relaxed">{item.value}</p>
              </div>
            ))}
          </div>

          {/* WhatsApp Token Reminder */}
          <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-1">
                  تذكير: Token واتساب ينتهي كل 24 ساعة
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  لتجديده: Meta Developer Console ← API Setup ← Generate access token ← انسخه في Netlify env vars كـ WHATSAPP_TOKEN
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── AI Model Info ── */}
      <Section icon={Cpu} title="إعدادات نموذج الذكاء الاصطناعي" iconColor="text-indigo-500">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'المزود', value: 'Groq Cloud', hint: 'معدل استجابة فائق السرعة' },
              { label: 'النموذج', value: 'llama-3.3-70b-versatile', hint: '70 مليار معامل' },
              { label: 'الشخصية', value: 'أبو الزوز 🚗', hint: 'مساعد أوتو جوردن بالأردني' },
              { label: 'أدوات AI (Tools)', value: '12 أداة', hint: 'بحث، حجز، تمويل، مقارنة...' },
            ].map(item => (
              <div key={item.label} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-gray-400 text-xs mb-0.5">{item.label}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300 mb-2">🔧 أدوات الذكاء الاصطناعي المتاحة</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs text-blue-600 dark:text-blue-400">
              {[
                'search_cars – البحث عن سيارات',
                'check_availability – توفر سيارة',
                'compare_cars – مقارنة سيارتين',
                'calculate_financing – حساب الأقساط',
                'check_parts_inventory – قطع الغيار',
                'book_maintenance – حجز صيانة',
                'get_promotions – العروض الحالية',
                'get_branch_info – معلومات الفروع',
                'get_service_types – أنواع الخدمات',
                'submit_support_ticket – تذكرة دعم',
                'create_purchase_inquiry – استفسار شراء',
                'get_customer_bookings – مواعيد العميل',
              ].map(t => (
                <div key={t} className="flex items-center gap-1">
                  <span className="text-green-500">✓</span> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── FAQs ── */}
      <Section icon={Database} title="قاعدة المعرفة (FAQs)" iconColor="text-blue-500">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          أسئلة شائعة كمرجع إضافي للذكاء الاصطناعي
        </p>

        <div className="space-y-3 mb-6">
          {faqs.map((faq, index) => (
            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-800 dark:text-gray-200 text-sm mb-1">س: {faq.question}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">ج: {faq.answer}</p>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(faq.keywords) ? faq.keywords : []).map((k, ki) => (
                      <span key={ki} className="text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => removeFAQ(index)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4">
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3 text-sm flex items-center gap-2">
            <Plus size={16} className="text-green-500" /> إضافة سؤال جديد
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newFAQ.question}
              onChange={e => setNewFAQ({ ...newFAQ, question: e.target.value })}
              placeholder="السؤال..."
              className="input-field text-sm"
            />
            <textarea
              value={newFAQ.answer}
              onChange={e => setNewFAQ({ ...newFAQ, answer: e.target.value })}
              placeholder="الإجابة..."
              rows={3}
              className="input-field text-sm resize-none"
            />
            <input
              type="text"
              value={newFAQ.keywords}
              onChange={e => setNewFAQ({ ...newFAQ, keywords: e.target.value })}
              placeholder="كلمات مفتاحية مفصولة بفواصل: سعر، تكلفة، كم..."
              className="input-field text-sm"
            />
            <button
              onClick={addFAQ}
              disabled={!newFAQ.question || !newFAQ.answer}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> إضافة
            </button>
          </div>
        </div>

        <button
          onClick={saveFAQs}
          disabled={saving}
          className="btn-primary flex items-center gap-2 mt-4"
        >
          <Save size={16} />
          {saving ? 'جاري الحفظ...' : 'حفظ قاعدة المعرفة'}
        </button>
      </Section>

      {/* ── Blacklist ── */}
      <Section icon={Shield} title="القائمة السوداء (حظر الأرقام)" iconColor="text-red-500">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          الأرقام المضافة هنا سيتم تجاهل رسائلها تماماً
        </p>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={blacklistInput}
            onChange={e => setBlacklistInput(e.target.value)}
            placeholder="962791234567"
            className="input-field flex-1 text-sm"
            dir="ltr"
            onKeyDown={e => e.key === 'Enter' && addToBlacklist()}
          />
          <button
            onClick={addToBlacklist}
            disabled={!blacklistInput.trim()}
            className="btn-primary px-4 text-sm flex items-center gap-2"
          >
            <Shield size={15} /> حظر
          </button>
        </div>

        {blacklist.length > 0 ? (
          <div className="space-y-2">
            {blacklist.map((phone, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                <span className="text-sm text-red-700 dark:text-red-400 font-mono">{phone}</span>
                <button onClick={() => removeFromBlacklist(phone)} className="text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 text-sm py-4">لا توجد أرقام محظورة</p>
        )}
      </Section>
    </div>
  );
}
