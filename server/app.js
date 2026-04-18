/**
 * أوتو جوردن - Express App
 * Auto Jordan Car Dealership - WhatsApp AI System
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config/env');
const logger = require('./utils/logger');
const {
    apiRateLimit,
    webhookRateLimit,
    login,
    logout,
    loginRateLimit,
    requireCsrf,
} = require('./middleware/auth');
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
const adminRoutes = require('./routes/admin.routes');

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
}));

// Capture the raw request body so the webhook can verify Meta's HMAC signature.
// `verify` runs BEFORE JSON.parse, so req.rawBody holds the exact bytes Meta signed.
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
        // Only keep raw bytes for webhook requests — other routes don't need them.
        if (req.originalUrl && req.originalUrl.startsWith('/webhook')) {
            req.rawBody = buf;
        }
    },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (config.server.nodeEnv !== 'test') {
    app.use(morgan('dev'));
}

// ==========================================
// Routes
// ==========================================

// =========================================================
// P2-04 · Health vs Readiness (split endpoints)
// =========================================================
//
// /health  — LIVENESS. Fast, no I/O, always 200 if the process can
//            answer HTTP. Orchestrator probes (Netlify, k8s-style) hit
//            this every few seconds and care only that the container
//            is alive.
//
// /ready   — READINESS. Full dependency check — Supabase live ping,
//            Groq config + TPD flag, WhatsApp credential presence,
//            last WhatsApp send success (from metrics). Returns 200
//            only if every critical dep is ok; otherwise 503. Dashboards
//            and on-call hit this one to understand actual health.
// =========================================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        name: 'أوتو جوردن - Auto Jordan',
        timestamp: new Date().toISOString(),
        uptime: typeof process !== 'undefined' ? process.uptime() : 0,
        version: '6.1.0',
    });
});

app.get('/ready', async (req, res) => {
    const geminiService = require('./services/gemini.service');
    const metrics       = require('./utils/metrics');
    const mode = getDbMode();

    // ── Supabase live probe ──
    let supabase = { ok: true, mode: mode.mode, persistent: mode.persistent };
    if (mode.mode === 'supabase') {
        const t0 = Date.now();
        try {
            const cars = await db.searchCars({});
            supabase.latency_ms = Date.now() - t0;
            supabase.sample_car_count = cars.length;
        } catch (e) {
            supabase = {
                ok: false,
                mode: mode.mode,
                persistent: mode.persistent,
                latency_ms: Date.now() - t0,
                error: e.message,
            };
        }
    }

    // ── Groq / LLM ──
    const groq = geminiService.getHealthStatus();
    // Not configured is a hard fail — the bot can't answer without it.
    if (!groq.configured) groq.ok = false; else groq.ok = true;

    // ── WhatsApp envelope (credential presence only — no outbound call) ──
    const whatsapp = {
        token_set:            !!(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN),
        phone_number_id_set:  !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        verify_token_set:     !!process.env.WHATSAPP_VERIFY_TOKEN,
        app_secret_set:       !!process.env.WHATSAPP_APP_SECRET,
    };
    whatsapp.ok = whatsapp.token_set
               && whatsapp.phone_number_id_set
               && whatsapp.verify_token_set
               && (config.server.nodeEnv !== 'production' || whatsapp.app_secret_set);

    // ── Last-send signal from in-process metrics (best-effort) ──
    let last_send_signal = null;
    try {
        const snap = metrics.snapshot();
        const sends = snap.counters.filter(c => c.name === 'step_total'
                                             && c.labels.step === 'whatsapp.sendTextMessage');
        if (sends.length) {
            const ok = sends.find(c => c.labels.outcome === 'ok')?.value || 0;
            const failed = sends.find(c => c.labels.outcome === 'failed')?.value || 0;
            last_send_signal = { ok, failed, total: ok + failed };
        }
    } catch (_) { /* metrics optional */ }

    const allOk = supabase.ok !== false && groq.ok && whatsapp.ok;
    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
        uptime: typeof process !== 'undefined' ? process.uptime() : 0,
        version: '6.1.0',
        checks: {
            supabase,
            groq,
            whatsapp,
            last_send_signal,
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
app.post('/api/auth/logout', logout);

// API — all state-changing API routes require CSRF token when called via cookie
app.use('/api/conversations', apiRateLimit, requireCsrf, conversationsRoutes);
app.use('/api/analytics',     apiRateLimit, requireCsrf, analyticsRoutes);
app.use('/api/manage',        apiRateLimit, requireCsrf, managementRoutes);
// Admin / ops — metrics + deeper health. Read-only but auth-gated so we
// don't leak request volumes / error kinds / internal step names.
app.use('/api/admin',         apiRateLimit, requireCsrf, adminRoutes);

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
