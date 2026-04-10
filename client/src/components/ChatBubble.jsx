import React from 'react';
import { CheckCheck, Check, Clock } from 'lucide-react';

// تنسيق الوقت
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

// أيقونة الحالة
const StatusIcon = ({ status }) => {
  switch (status) {
    case 'sent':
      return <Check size={12} className="text-gray-400" />;
    case 'delivered':
      return <CheckCheck size={12} className="text-gray-400" />;
    case 'read':
      return <CheckCheck size={12} className="text-blue-400" />;
    default:
      return <Clock size={12} className="text-gray-300" />;
  }
};

// فقاعة رسالة العميل
export function CustomerBubble({ message, timestamp }) {
  return (
    <div className="flex items-end gap-2 mb-3 justify-start animate-message-in">
      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300 flex-shrink-0">
        👤
      </div>
      <div className="max-w-[75%]">
        <div className="bubble-customer">
          <p className="text-sm leading-relaxed break-words">{message}</p>
        </div>
        <p className="text-xs text-gray-400 mt-1 px-1">{formatTime(timestamp)}</p>
      </div>
    </div>
  );
}

// فقاعة رد الـ AI
export function AIBubble({ message, timestamp, status, responseTime }) {
  return (
    <div className="flex items-end gap-2 mb-3 justify-end animate-message-in">
      <div className="max-w-[75%]">
        <div className="bubble-ai">
          <p className="text-sm leading-relaxed break-words">{message}</p>
        </div>
        <div className="flex items-center gap-1 justify-end mt-1 px-1">
          {responseTime && (
            <span className="text-xs text-gray-400">{responseTime}ms</span>
          )}
          <span className="text-xs text-gray-400">{formatTime(timestamp)}</span>
          <StatusIcon status={status} />
        </div>
      </div>
      <div className="w-7 h-7 rounded-full bg-whatsapp-green/20 flex items-center justify-center flex-shrink-0 flex-col">
        <span className="text-xs text-whatsapp-green">🤖</span>
      </div>
    </div>
  );
}

// مؤشر الكتابة
export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3 justify-end">
      <div className="bubble-ai p-3 flex items-center">
        <div className="typing-indicator flex gap-1">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div className="w-7 h-7 rounded-full bg-whatsapp-green/20 flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-whatsapp-green">🤖</span>
      </div>
    </div>
  );
}

// رسالة نظام (تاريخ، وصل، إلخ)
export function SystemMessage({ text }) {
  return (
    <div className="flex justify-center my-4">
      <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400
                       text-xs px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}

export default { CustomerBubble, AIBubble, TypingIndicator, SystemMessage };
