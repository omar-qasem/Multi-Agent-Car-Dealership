import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search, Send, Phone, RefreshCw,
  MessageSquare, Loader2, Bell
} from 'lucide-react';
import { CustomerBubble, AIBubble, SystemMessage } from '../components/ChatBubble';

// تنسيق الوقت
const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  const diff = (Date.now() - new Date(timestamp)) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعة`;
  return `${Math.floor(diff / 86400)} يوم`;
};

const SentimentBadge = ({ sentiment }) => {
  const map = { 'إيجابي': 'badge-positive', 'سلبي': 'badge-negative', 'محايد': 'badge-neutral' };
  return (
    <span className={map[sentiment] || 'badge-neutral'}>
      {sentiment === 'إيجابي' ? '😊' : sentiment === 'سلبي' ? '😞' : '😐'} {sentiment}
    </span>
  );
};

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendLoading, setSendLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [notification, setNotification] = useState(null);
  const [prevCount, setPrevCount] = useState(0);
  const messagesEndRef = useRef(null);
  const pollingRef = useRef(null);

  const fetchConversations = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = {};
      if (searchQuery) params.phone = searchQuery;
      if (filterTopic) params.topic = filterTopic;

      const res = await axios.get('/api/conversations', { params });
      const raw = res.data.data || [];
      // Normalize field names (API may return phone_number or phoneNumber)
      const data = raw.map(c => ({
        phoneNumber:  c.phoneNumber || c.phone_number || c.phone || '',
        customerName: c.customerName || c.customer_name || c.phoneNumber || c.phone_number || '',
        lastTime:     c.lastTime || c.last_message || c.last_message_at || '',
        lastMessage:  c.lastMessage || c.last_message || '',
        messages: (c.messages || []).map(m => ({
          id:              m.id || Math.random().toString(36),
          customerMessage: m.customerMessage || m.customer_message || m.customer || '',
          aiResponse:      m.aiResponse || m.ai_response || m.ai || '',
          timestamp:       m.timestamp || m.created_at || m.time || '',
          sentiment:       m.sentiment || 'محايد',
          topic:           m.topic || 'عام',
          responseTime:    m.responseTime || m.response_time || 0,
          status:          m.status || 'delivered',
          tools:           m.tools_used || m.tools || '',
        })),
        message_count: c.message_count || (c.messages || []).length,
      }));

      // إشعار برسائل جديدة
      const totalMessages = data.reduce((sum, c) => sum + c.messages.length, 0);
      if (prevCount > 0 && totalMessages > prevCount) {
        const diff = totalMessages - prevCount;
        setNotification(`📩 وصلت ${diff} رسالة جديدة!`);
        setTimeout(() => setNotification(null), 4000);
        // صوت بسيط
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        } catch {}
      }
      setPrevCount(totalMessages);

      setConversations(data);

      // تحديث المحادثة المحددة
      if (selected) {
        const updated = data.find(c => c.phoneNumber === selected.phoneNumber);
        if (updated) setSelected(updated);
      }
    } catch (error) {
      console.error('فشل تحميل المحادثات:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    // Polling كل 10 ثواني
    pollingRef.current = setInterval(() => fetchConversations(true), 10000);
    return () => clearInterval(pollingRef.current);
  }, [searchQuery, filterTopic]);

  // تمرير للأسفل عند اختيار محادثة
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [selected?.phoneNumber]);

  const handleSend = async () => {
    if (!replyText.trim() || !selected) return;
    setSendLoading(true);
    try {
      await axios.post('/api/conversations/send', { to: selected.phoneNumber, message: replyText });
      setReplyText('');
      await fetchConversations(true);
    } catch (error) {
      alert('فشل إرسال الرسالة: ' + (error.response?.data?.message || error.message));
    } finally {
      setSendLoading(false);
    }
  };

  const filteredConversations = conversations.filter(c =>
    !searchQuery ||
    c.phoneNumber?.includes(searchQuery) ||
    c.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedMessages = selected
    ? [...(selected.messages || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    : [];

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white dark:bg-gray-800 rounded-2xl
                    shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">

      {/* إشعار */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50
                        bg-whatsapp-green text-white px-6 py-3 rounded-xl shadow-lg
                        flex items-center gap-2 animate-slide-up">
          <Bell size={16} /> {notification}
        </div>
      )}

      {/* قائمة المحادثات */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col border-l border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center justify-between">
            <span>المحادثات</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">كل 10ث</span>
              <button onClick={() => fetchConversations()} disabled={loading}>
                <RefreshCw size={14} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </h2>
          <div className="relative mb-2">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pr-9 text-sm py-2"
            />
          </div>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="input-field text-sm py-2"
          >
            <option value="">كل المواضيع</option>
            {['أسعار','منتجات','شكاوى','دعم فني','توصيل','إرجاع','استفسارات'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-whatsapp-green" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <MessageSquare size={28} className="mb-2 opacity-40" />
              <p className="text-sm">لا توجد محادثات</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.phoneNumber}
                onClick={() => setSelected(conv)}
                className={`conversation-card ${selected?.phoneNumber === conv.phoneNumber ? 'selected' : ''}`}
              >
                <div className="w-11 h-11 rounded-full bg-whatsapp-green/20 flex items-center justify-center
                                text-whatsapp-green font-bold text-base flex-shrink-0">
                  {(conv.customerName || conv.phoneNumber).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">
                      {conv.customerName || conv.phoneNumber}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0 mr-2">
                      {timeAgo(conv.lastTime)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{conv.lastMessage}</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Phone size={9} /> {conv.phoneNumber}
                    <span className="text-whatsapp-green">• {conv.messages?.length} رسالة</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* تفاصيل المحادثة */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* رأس المحادثة */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-750">
            <div className="w-10 h-10 rounded-full bg-whatsapp-green/20 flex items-center justify-center text-whatsapp-green font-bold">
              {(selected.customerName || selected.phoneNumber).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 dark:text-white text-sm">
                {selected.customerName || selected.phoneNumber}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Phone size={10} /> {selected.phoneNumber}
                </span>
                <span className="text-xs text-gray-400">{selectedMessages.length} رسالة</span>
              </div>
            </div>
            {selectedMessages[0]?.sentiment && (
              <SentimentBadge sentiment={selectedMessages[0].sentiment} />
            )}
          </div>

          {/* الرسائل */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#f0ebe3] dark:bg-gray-900/30">
            <SystemMessage text={`محادثة مع ${selected.customerName || selected.phoneNumber}`} />
            {selectedMessages.map((msg, idx) => (
              <div key={msg.id || idx}>
                <CustomerBubble message={msg.customerMessage} timestamp={msg.timestamp} />
                <AIBubble
                  message={msg.aiResponse}
                  timestamp={msg.timestamp}
                  status={msg.status || 'delivered'}
                  responseTime={msg.responseTime}
                />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* حقل الإرسال */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="رسالة يدوية..."
                className="input-field flex-1 text-sm py-3"
              />
              <button
                onClick={handleSend}
                disabled={sendLoading || !replyText.trim()}
                className="btn-primary p-3 rounded-xl"
              >
                {sendLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="rotate-180" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">رسالة يدوية • تُرسل مباشرة عبر WhatsApp</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900/20">
          <MessageSquare size={56} className="mb-4 opacity-20" />
          <p className="text-lg font-medium">اختر محادثة للعرض</p>
          <p className="text-sm mt-1 text-gray-400">يتحدث الداشبورد كل 10 ثواني تلقائياً</p>
        </div>
      )}
    </div>
  );
}
