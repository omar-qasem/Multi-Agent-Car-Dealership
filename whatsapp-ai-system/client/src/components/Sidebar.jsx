import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, BarChart3, Settings,
  LogOut, Moon, Sun, Calendar, Car, Wrench, Building2,
  ClipboardList, ShoppingCart
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// ── Badge component ──────────────────────────────────────────────────────────
function Badge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold
                     flex items-center justify-center flex-shrink-0 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Sidebar({ isOpen, onToggle }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Live badge counts
  const [badges, setBadges] = useState({
    bookings_pending: 0,
    tickets_open: 0,
    inquiries_new: 0,
    parts_issues: 0,
  });

  const fetchBadges = useCallback(async () => {
    try {
      const res = await axios.get('/api/manage/live-stats');
      const d = res.data.data || {};
      setBadges({
        bookings_pending: d.bookings_pending || 0,
        tickets_open:     d.tickets_open     || 0,
        inquiries_new:    d.inquiries_new    || 0,
        parts_issues:     (d.parts_out_of_stock || 0) + (d.parts_low_stock || 0),
      });
    } catch { /* silent – badges optional */ }
  }, []);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, 30 * 1000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchBadges]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Nav structure with dynamic badge references ──────────────────────────
  const navGroups = [
    {
      label: 'الرئيسية',
      items: [
        { path: '/',              label: 'لوحة التحكم',  icon: LayoutDashboard },
        { path: '/conversations', label: 'المحادثات',    icon: MessageSquare   },
        { path: '/analytics',     label: 'التحليلات',    icon: BarChart3       },
      ],
    },
    {
      label: 'الإدارة',
      items: [
        { path: '/bookings',  label: 'الحجوزات والمواعيد', icon: Calendar,    badgeKey: 'bookings_pending' },
        { path: '/cars',      label: 'مخزون السيارات',      icon: Car                                       },
        { path: '/parts',     label: 'قطع الغيار',          icon: Wrench,      badgeKey: 'parts_issues'    },
        { path: '/branches',  label: 'الأفرع والجداول',     icon: Building2                                 },
        { path: '/tickets',   label: 'تذاكر الدعم',         icon: ClipboardList, badgeKey: 'tickets_open'    },
        { path: '/inquiries', label: 'استفسارات الشراء',    icon: ShoppingCart,badgeKey: 'inquiries_new'   },
      ],
    },
    {
      label: '',
      items: [
        { path: '/settings', label: 'الإعدادات', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className="fixed top-4 right-4 z-50 lg:hidden bg-green-500 text-white p-2 rounded-lg shadow-lg"
        aria-label="فتح/إغلاق القائمة"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isOpen
            ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            : <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
          }
        </svg>
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onToggle} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed right-0 top-0 h-full w-64 z-40
        bg-white dark:bg-gray-800 border-l border-gray-100 dark:border-gray-700
        flex flex-col shadow-lg transition-transform duration-300
        ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0
      `}>

        {/* Logo */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-sm text-lg">
              🚗
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-sm leading-none">أوتو جوردن</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">لوحة إدارة المعرض</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs px-2.5 py-1.5 rounded-lg
                          bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span>نظام واتساب AI نشط</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'pt-2' : ''}>
              {group.label && (
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-3 pb-1.5 pt-1 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon    = item.icon;
                const isActive = location.pathname === item.path;
                const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;

                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); if (window.innerWidth < 1024) onToggle(); }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                      transition-all duration-150 text-right
                      ${isActive
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }
                    `}
                  >
                    <Icon size={18} className={isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
                    <span className="flex-1 text-right">{item.label}</span>
                    {badgeCount > 0 && <Badge count={badgeCount} />}
                    {isActive && !badgeCount && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                  </button>
                );
              })}
              {gi < navGroups.length - 2 && (
                <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-sm">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{user?.username || 'المدير'}</p>
              <p className="text-xs text-gray-400">{user?.role === 'admin' ? 'مدير النظام' : 'موظف'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl
                         text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              <span>{isDark ? 'فاتح' : 'داكن'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl
                         text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm"
            >
              <LogOut size={16} />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
