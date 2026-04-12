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
const db = require('./database/db');
const { initDatabase, getDbMode } = db;

// Initialize Database (async — runs in background, doesn't block app startup)
initDatabase()
    .then(() => {
        const mode = getDbMode();
        logger.info(`🚗 أوتو جوردن - قاعدة البيانات جاهزة (mode=${mode.mode}, persistent=${mode.persistent})`);
    })
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
        // In production with no CORS_ORIGIN set, reject cross-origin requests
        if (allowedOrigins.length === 0 && config.server.nodeEnv === 'production') {
            logger.warn(`❌ CORS blocked (no CORS_ORIGIN configured): ${origin}`);
            return cb(new Error('CORS policy violation — set CORS_ORIGIN env var'));
        }
        // In dev with no allowedOrigins, allow all
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

// Health Check — reflects REAL runtime state, not just presence of env vars
app.get('/health', async (req, res) => {
    const mode = getDbMode();

    // Live ping: actually hit Supabase to confirm schema is reachable right now
    let supabaseLive = null;
    let supabaseError = null;
    if (mode.mode === 'supabase') {
        try {
            const cars = await db.searchCars({});
            supabaseLive = { ok: true, sample_car_count: cars.length };
        } catch (e) {
            supabaseLive = { ok: false };
            supabaseError = e.message;
        }
    }

    res.json({
        status: supabaseLive?.ok === false ? 'degraded' : 'ok',
        name: 'أوتو جوردن - Auto Jordan',
        timestamp: new Date().toISOString(),
        uptime: typeof process !== 'undefined' ? process.uptime() : 0,
        version: '6.1.0',
        database: {
            mode: mode.mode,             // 'supabase' | 'in-memory'
            persistent: mode.persistent, // true | false
            live_check: supabaseLive,    // null if in-memory, object if supabase
            live_error: supabaseError,
        },
        features: ['AI Agent', '12 Tools', 'Car Inventory', 'Parts Inventory', 'Booking', 'Tickets', 'Inquiries'],
    });
});

// Debug endpoint — protected: requires auth in production, dev-only otherwise
app.get('/debug-env', (req, res) => {
    // Block entirely in production — no config info should ever leak
    if (config.server.nodeEnv === 'production') {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    const mode = getDbMode();
    res.json({
        VERIFY_TOKEN_SET:   !!process.env.WHATSAPP_VERIFY_TOKEN,
        WHATSAPP_TOKEN_SET: !!process.env.WHATSAPP_ACCESS_TOKEN || !!process.env.WHATSAPP_TOKEN,
        GROQ_KEY_SET:       !!process.env.GROQ_API_KEY,
        GROQ_MODEL:         process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        NODE_ENV:           process.env.NODE_ENV,
        IS_NETLIFY:         !!process.env.NETLIFY,
        SUPABASE_URL_SET:   !!process.env.SUPABASE_URL,
        SUPABASE_KEY_SET:   !!process.env.SUPABASE_SERVICE_KEY,
        DB_MODE:            mode.mode,
        DB_PERSISTENT:      mode.persistent,
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

// Error Handler — hide internals in production, show details in dev
app.use((err, req, res, next) => {
    logger.error('❌ خطأ غير متوقع:', err.message || err);
    const response = {
        success: false,
        message: 'حدث خطأ داخلي في النظام',
    };
    // Only expose error details in development — never leak stack/message in production
    if (config.server.nodeEnv !== 'production') {
        response.error = err.message || 'Unknown error';
    }
    res.status(500).json(response);
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `المسار ${req.path} غير موجود` });
});

module.exports = app;
