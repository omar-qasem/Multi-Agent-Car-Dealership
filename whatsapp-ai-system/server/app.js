/**
 * أوتو جوردن - Express App
 * Auto Jordan Car Dealership - WhatsApp AI System
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config/env');
const logger = require('./utils/logger');
const { apiRateLimit, webhookRateLimit, login, loginRateLimit } = require('./middleware/auth');
const { initDatabase } = require('./database/db');

// Initialize Database (async — runs in background, doesn't block app startup)
initDatabase()
    .then(() => logger.info('🚗 أوتو جوردن - قاعدة البيانات جاهزة'))
    .catch(error => logger.error('❌ فشل تهيئة قاعدة البيانات:', error));

// Routes
const webhookRoutes = require('./routes/webhook.routes');
const conversationsRoutes = require('./routes/conversations.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const managementRoutes = require('./routes/management.routes');

const app = express();

app.set('trust proxy', 1);

// ==========================================
// Middleware
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

// Default dev origins
if (allowedOrigins.length === 0 && config.server.nodeEnv !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
}

app.use(cors({
    origin: (origin, cb) => {
        // Allow same-origin requests (no Origin header) — Netlify serves frontend+API from same domain
        if (!origin) return cb(null, true);
        // Allow whitelisted origins
        if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) return cb(null, true);
        // In production with no CORS_ORIGIN set, allow all (Netlify same-origin handles security)
        if (allowedOrigins.length === 0) return cb(null, true);
        logger.warn(`❌ CORS blocked origin: ${origin}`);
        return cb(new Error('CORS policy violation'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.server.nodeEnv !== 'test') {
    app.use(morgan('dev'));
}

// ==========================================
// Routes
// ==========================================

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        name: 'أوتو جوردن - Auto Jordan',
        timestamp: new Date().toISOString(),
        uptime: typeof process !== 'undefined' ? process.uptime() : 0,
        version: '6.0.0',
        storage: process.env.SUPABASE_URL ? 'Supabase (PostgreSQL)' : 'In-Memory (fallback)',
        supabase: !!process.env.SUPABASE_URL,
        features: ['AI Agent', '12 Tools', 'Car Inventory', 'Parts Inventory', 'Booking', 'Tickets', 'Inquiries', 'Supabase'],
    });
});

// Debug endpoint
app.get('/debug-env', (req, res) => {
    res.json({
        VERIFY_TOKEN_SET: !!process.env.WHATSAPP_VERIFY_TOKEN,
        WHATSAPP_TOKEN_SET: !!process.env.WHATSAPP_TOKEN,
        GROQ_KEY_SET: !!process.env.GROQ_API_KEY,
        GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        NODE_ENV: process.env.NODE_ENV,
        IS_NETLIFY: !!process.env.NETLIFY,
        SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
        SUPABASE_KEY_SET: !!process.env.SUPABASE_SERVICE_KEY,
        DB_STORAGE: process.env.SUPABASE_URL ? 'Supabase' : 'In-Memory',
    });
});

// Webhook
app.use('/webhook', webhookRateLimit, webhookRoutes);

// Auth
app.post('/api/auth/login', loginRateLimit, login);

// API
app.use('/api/conversations', apiRateLimit, conversationsRoutes);
app.use('/api/analytics', apiRateLimit, analyticsRoutes);
app.use('/api/manage', apiRateLimit, managementRoutes);

// Serve Frontend
if (config.server.nodeEnv === 'production' && !process.env.NETLIFY) {
    const distPath = path.join(__dirname, '../client/dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// Error Handler — always include error.message to aid debugging on Netlify
app.use((err, req, res, next) => {
    logger.error('❌ خطأ غير متوقع:', err.message || err);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي في النظام',
        error: err.message || 'Unknown error',
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `المسار ${req.path} غير موجود` });
});

module.exports = app;
