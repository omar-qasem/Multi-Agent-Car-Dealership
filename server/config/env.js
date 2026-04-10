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

// JWT_SECRET — must be set and strong (warn loudly but don't crash)
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    const msg = '⚠️  WARNING: JWT_SECRET should be set in .env and be at least 32 characters long.\n' +
                '   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
    console.error(msg);
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
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

    // Server
    server: {
        port: parseInt(process.env.PORT) || 3000,
        nodeEnv: nodeEnv,
        jwtSecret: jwtSecret || 'dev_only_insecure_secret_please_change_in_env_file_32chars',
        jwtExpiresIn: '7d',
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    // Database
    database: {
        type: 'sqlite',
        path: process.env.DB_PATH || './server/database/autojordan.db',
    },

    // Cache
    cache: {
        ttl: 300,
        maxSize: 1000,
    },
};
