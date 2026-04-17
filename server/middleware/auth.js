/**
 * Middleware للمصادقة والأمان
 * Authentication & Security Middleware
 *
 * P0-05: Passwords are stored as bcrypt hashes. ADMIN_PASSWORD_HASH is the
 *        source of truth in production; ADMIN_PASSWORD is accepted only in
 *        development and is hashed at boot time (with a loud warning).
 * P0-05: JWT_SECRET enforcement lives in config/env.js — this module trusts
 *        that config validated it already.
 * P0-07: Login issues an HttpOnly; Secure; SameSite=Lax cookie plus a
 *        non-HttpOnly CSRF token. Protected routes require both a valid
 *        cookie AND a matching `x-csrf-token` header (double-submit pattern).
 */

const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const crypto    = require('node:crypto');
const rateLimit = require('express-rate-limit');
const config    = require('../config/env');
const logger    = require('../utils/logger');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ------------------------------------------------------------
// Admin credentials — bcrypt hash is the source of truth
// ------------------------------------------------------------
// In production:  ADMIN_USERNAME + ADMIN_PASSWORD_HASH must be set.
//                 Plaintext ADMIN_PASSWORD is REJECTED.
// In development: falls back to a weak default and warns loudly.
const BCRYPT_ROUNDS = 12;

function resolveAdminHash() {
    const explicitHash = process.env.ADMIN_PASSWORD_HASH;
    if (explicitHash && explicitHash.startsWith('$2')) return explicitHash;

    if (IS_PRODUCTION) {
        console.error('🚫 FATAL: ADMIN_PASSWORD_HASH must be set (bcrypt hash, starts with $2).');
        console.error('   Generate one with:');
        console.error('   node scripts/hash-admin-password.js "yourStrongPassword"');
        throw new Error('Missing ADMIN_PASSWORD_HASH in production environment');
    }

    // Dev fallback — hash the plaintext at boot so we never store plaintext in memory.
    const plaintext = process.env.ADMIN_PASSWORD || 'admin123';
    console.warn('⚠️  Dev auth: hashing ADMIN_PASSWORD at boot. Set ADMIN_PASSWORD_HASH in production.');
    return bcrypt.hashSync(plaintext, BCRYPT_ROUNDS);
}

const ADMIN_USERNAME  = process.env.ADMIN_USERNAME || (IS_PRODUCTION ? null : 'admin');
if (IS_PRODUCTION && !ADMIN_USERNAME) {
    console.error('🚫 FATAL: ADMIN_USERNAME must be set in production.');
    throw new Error('Missing ADMIN_USERNAME in production environment');
}

const ADMIN_PASSWORD_HASH = resolveAdminHash();

const USERS = [
    {
        id: 1,
        username: ADMIN_USERNAME,
        passwordHash: ADMIN_PASSWORD_HASH,
        role: 'admin',
        name: 'مدير النظام',
    },
];

// ------------------------------------------------------------
// Cookie + CSRF helpers
// ------------------------------------------------------------
const AUTH_COOKIE_NAME = 'aj_session';
const CSRF_COOKIE_NAME = 'aj_csrf';

function cookieOptions({ httpOnly = true, maxAgeMs = 7 * 24 * 3600 * 1000 } = {}) {
    return {
        httpOnly,
        secure: config.server.cookieSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeMs,
    };
}

function issueCsrfToken() {
    return crypto.randomBytes(24).toString('hex');
}

/**
 * P0-07: Double-submit CSRF check.
 *   - GET/HEAD/OPTIONS: always allowed (safe, idempotent).
 *   - Other methods:    `x-csrf-token` header must equal `aj_csrf` cookie.
 *
 * Legacy `Authorization: Bearer <jwt>` requests are exempt from CSRF because
 * browsers don't auto-attach custom headers cross-origin — the attacker-caused
 * request couldn't include the Authorization header either.
 */
const requireCsrf = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    // Bearer-token requests are not cookie-based → no CSRF needed
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) return next();

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({
            success: false,
            message: 'CSRF token missing or mismatched',
            reason: 'csrf_check_failed',
        });
    }
    next();
};

/**
 * التحقق من JWT Token (Bearer header OR HttpOnly cookie)
 */
const authenticateToken = (req, res, next) => {
    let token = null;

    // Prefer cookie (P0-07 path) but still accept Bearer for CLI / legacy scripts
    if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
        token = req.cookies[AUTH_COOKIE_NAME];
    } else {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    }

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
 *
 * On success:
 *   - Sets HttpOnly `aj_session` cookie with the JWT
 *   - Sets non-HttpOnly `aj_csrf` cookie the client echoes back as x-csrf-token
 *   - Also returns `token` + `csrfToken` in JSON for CLI / non-browser clients
 */
const login = async (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'اسم المستخدم وكلمة المرور مطلوبان',
        });
    }

    const user = USERS.find(u => u.username === username);

    // Always run bcrypt.compare, even on unknown user, to equalise timing
    const validHash = user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinva.invalidinvalidinvalidinva';
    let ok = false;
    try {
        ok = await bcrypt.compare(password, validHash);
    } catch (e) {
        logger.error('bcrypt.compare failed', e);
        ok = false;
    }

    if (!user || !ok) {
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

    const csrfToken = issueCsrfToken();

    // HttpOnly session cookie
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions({ httpOnly: true }));
    // CSRF cookie — readable by JS so the SPA can echo it back as a header
    res.cookie(CSRF_COOKIE_NAME, csrfToken, cookieOptions({ httpOnly: false }));

    logger.success('تسجيل دخول ناجح', { username });

    res.json({
        success: true,
        // Legacy token field kept for CLI clients; browsers should rely on cookies.
        token,
        csrfToken,
        user: { id: user.id, username: user.username, role: user.role, name: user.name },
        expiresIn: config.server.jwtExpiresIn || '24h',
    });
};

/**
 * Log out — clear both cookies.
 */
const logout = (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    res.json({ success: true });
};

// ------------------------------------------------------------
// Rate limiting
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Blacklist (phone numbers)
// ------------------------------------------------------------
const blacklistedNumbers = new Set();
const checkBlacklist      = (phoneNumber) => blacklistedNumbers.has(phoneNumber);
const addToBlacklist      = (phoneNumber) => { blacklistedNumbers.add(phoneNumber);    logger.info(`تمت إضافة الرقم ${phoneNumber} للقائمة السوداء`); };
const removeFromBlacklist = (phoneNumber) => { blacklistedNumbers.delete(phoneNumber); logger.info(`تمت إزالة الرقم ${phoneNumber} من القائمة السوداء`); };
const getBlacklist        = () => Array.from(blacklistedNumbers);

module.exports = {
    authenticateToken,
    login,
    logout,
    requireCsrf,
    apiRateLimit,
    webhookRateLimit,
    loginRateLimit,
    checkBlacklist,
    addToBlacklist,
    removeFromBlacklist,
    getBlacklist,
    // Exposed for tests
    AUTH_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    BCRYPT_ROUNDS,
};
