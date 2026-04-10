/**
 * Middleware للمصادقة والأمان
 * Authentication & Security Middleware
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../utils/logger');

// بيانات الدخول من المتغيرات البيئية (مع قيم افتراضية آمنة للتطوير فقط)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  console.error('⚠️  WARNING: ADMIN_USERNAME and ADMIN_PASSWORD not set in .env — using insecure defaults!');
}

if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 8) {
  console.error('⚠️  WARNING: ADMIN_PASSWORD is very short. Use at least 8 characters.');
}

const USERS = [
  {
    id: 1,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    role: 'admin',
    name: 'مدير النظام',
  },
];

/**
 * التحقق من JWT Token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'لم يتم توفير توكن المصادقة',
    });
  }

  try {
    const decoded = jwt.verify(token, config.server.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('توكن غير صالح', error.message);
    return res.status(403).json({
      success: false,
      message: 'توكن المصادقة غير صالح أو منتهي الصلاحية',
    });
  }
};

/**
 * تسجيل الدخول والحصول على Token
 */
const login = (req, res) => {
  const { username, password } = req.body;

  const user = USERS.find(u => u.username === username && u.password === password);

  if (!user) {
    logger.warn('محاولة دخول فاشلة', { username });
    return res.status(401).json({
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.server.jwtSecret,
    { expiresIn: config.server.jwtExpiresIn || '24h' }
  );

  logger.success('تسجيل دخول ناجح', { username });

  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, role: user.role, name: user.name },
    expiresIn: config.server.jwtExpiresIn || '24h',
  });
};

/**
 * Rate Limiting - تحديد معدل الطلبات
 * keyGenerator مخصص لبيئة Netlify الـ serverless (req.ip قد يكون undefined)
 */
const getClientKey = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
};

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'طلبات كثيرة جداً، يرجى المحاولة بعد قليل' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: false,
});

const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'تجاوز حد الرسائل المسموح به' },
  keyGenerator: getClientKey,
  validate: false,
});

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'محاولات دخول كثيرة جداً، يرجى الانتظار 15 دقيقة' },
  keyGenerator: getClientKey,
  validate: false,
});

/**
 * قائمة الأرقام المحظورة
 */
const blacklistedNumbers = new Set();

const checkBlacklist = (phoneNumber) => blacklistedNumbers.has(phoneNumber);
const addToBlacklist = (phoneNumber) => {
  blacklistedNumbers.add(phoneNumber);
  logger.info(`تمت إضافة الرقم ${phoneNumber} للقائمة السوداء`);
};
const removeFromBlacklist = (phoneNumber) => {
  blacklistedNumbers.delete(phoneNumber);
  logger.info(`تمت إزالة الرقم ${phoneNumber} من القائمة السوداء`);
};
const getBlacklist = () => Array.from(blacklistedNumbers);

module.exports = {
  authenticateToken,
  login,
  apiRateLimit,
  webhookRateLimit,
  loginRateLimit,
  checkBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  getBlacklist,
};
