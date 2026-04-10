import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'green',
  trend,
  trendValue,
  loading = false,
}) {
  const colorClasses = {
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      icon: 'text-whatsapp-green',
      badge: 'bg-whatsapp-green text-white',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      icon: 'text-blue-500',
      badge: 'bg-blue-500 text-white',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      icon: 'text-purple-500',
      badge: 'bg-purple-500 text-white',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      icon: 'text-orange-500',
      badge: 'bg-orange-500 text-white',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      icon: 'text-red-500',
      badge: 'bg-red-500 text-white',
    },
  };

  const colors = colorClasses[color] || colorClasses.green;

  if (loading) {
    return (
      <div className="stat-card animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
          </div>
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-2">
            {title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
          )}

          {/* مؤشر الاتجاه */}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
              trend > 0 ? 'text-green-500' :
              trend < 0 ? 'text-red-500' :
              'text-gray-400'
            }`}>
              {trend > 0 ? <TrendingUp size={12} /> :
               trend < 0 ? <TrendingDown size={12} /> :
               <Minus size={12} />}
              <span>{trendValue || `${Math.abs(trend)}%`} مقارنة بالأمس</span>
            </div>
          )}
        </div>

        {/* الأيقونة */}
        {Icon && (
          <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center
                          ${colors.icon} transition-transform duration-200 group-hover:scale-110`}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}
