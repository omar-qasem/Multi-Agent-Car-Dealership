/**
 * أوتو جوردن - إعدادات البيئة
 * Auto Jordan Environment Configuration
 */

require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// ==========================================
// Validate required secrets
// ==========================================

// JWT_SECRET — MUST be set and strong in production. Crash hard rather than
// boot with a guessable default: a default secret means every JWT is forgeable.
const jwtSecret = process.env.JWT_SECRET;
if (isProduction) {
    if (!jwtSecret) {
        console.error('🚫 FATAL: JWT_SECRET is not set in production. Refusing to start.');
        console.error('   Generate one with:');
        console.error('   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
        throw new Error('Missing JWT_SECRET in production environment');
    }
    if (jwtSecret.length < 32) {
        console.error(`🚫 FATAL: JWT_SECRET is too short (${jwtSecret.length} chars). Must be at least 32.`);
        throw new Error('JWT_SECRET too short in production environment');
    }
    // Reject obvious placeholder values
    const forbidden = ['change', 'secret', 'default', 'insecure', 'please', 'your_', 'example'];
    const lower = jwtSecret.toLowerCase();
    if (forbidden.some(w => lower.includes(w))) {
        console.error('🚫 FATAL: JWT_SECRET looks like a placeholder value. Set a real random secret.');
        throw new Error('JWT_SECRET looks like a placeholder in production environment');
    }
} else if (!jwtSecret || jwtSecret.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters. Using dev-only fallback.');
    console.warn('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

// WHATSAPP_VERIFY_TOKEN — should be set explicitly
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
if (!verifyToken) {
    console.error('⚠️  WARNING: WHATSAPP_VERIFY_TOKEN not set — webhook verification will fail.');
}

module.exports = {
    // WhatsApp Cloud API
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        verifyToken: verifyToken,
        businessId: process.env.WHATSAPP_BUSINESS_ID,
        apiVersion: 'v18.0',
        apiBaseUrl: 'https://graph.facebook.com',
    },

    // Groq AI
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || 'qwen/qwen3-32b',

    // Server
    server: {
        port: parseInt(process.env.PORT) || 3000,
        nodeEnv: nodeEnv,
        jwtSecret: jwtSecret || 'dev_only_insecure_secret_please_change_in_env_file_32chars',
        jwtExpiresIn: '7d',
        cookieSecure: isProduction, // cookie Secure flag
        csrfSecret: process.env.CSRF_SECRET || (jwtSecret ? `csrf_${jwtSecret.slice(0, 16)}` : 'dev_csrf_secret_change_me'),
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    // Cache
    cache: {
        ttl: 300,
        maxSize: 1000,
    },
};
