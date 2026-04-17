/**
 * Meta webhook HMAC-SHA256 signature verification.
 *
 * Meta signs every POST body with APP_SECRET and puts the digest in the
 * X-Hub-Signature-256 header. Without this check, any third party who knows
 * the webhook URL can forge WhatsApp messages.
 *
 * Usage (Express):
 *   const { verifyMetaSignature } = require('../middleware/webhookSignature');
 *   router.post('/', verifyMetaSignature, handler);
 *
 * The middleware requires `req.rawBody` (captured by express.json({verify}))
 * to be the exact bytes Meta signed.
 */

const crypto = require('crypto');

// Read env at call-time (not module-load) so tests can override process.env.
function getAppSecret() {
    return process.env.WHATSAPP_APP_SECRET || '';
}
function isProduction() {
    return process.env.NODE_ENV === 'production';
}
function allowUnsigned() {
    return process.env.WHATSAPP_ALLOW_UNSIGNED === 'true';
}

/**
 * Constant-time comparison of two hex strings of equal length.
 * Returns false on length mismatch without leaking position.
 */
function safeEqualHex(aHex, bHex) {
    if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
    if (aHex.length !== bHex.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
    } catch {
        return false;
    }
}

/**
 * Compute the expected `sha256=<hex>` signature for a given raw body.
 * Exposed so clients (tests, internal tools) can produce valid signatures.
 */
function computeSignature(rawBody, secret = getAppSecret()) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Express middleware. On the POST body path:
 *  - production + no APP_SECRET       → 500 (misconfigured)
 *  - missing / malformed header       → 401
 *  - mismatch                         → 401
 *  - match                            → next()
 * GET (verification handshake) passes through untouched.
 */
function verifyMetaSignature(req, res, next) {
    if (req.method !== 'POST') return next();

    const secret = getAppSecret();
    const header = req.headers['x-hub-signature-256'] || '';
    const rawBody = req.rawBody;

    // If APP_SECRET is not configured, block in production, allow-with-warning in dev.
    if (!secret) {
        if (isProduction()) {
            // Use console.error so we don't need the logger module here.
            console.error('[WEBHOOK] ❌ rejected — WHATSAPP_APP_SECRET not configured');
            return res.status(500).json({ status: 'error', reason: 'signature_verification_unconfigured' });
        }
        if (!allowUnsigned()) {
            console.warn('[WEBHOOK] ⚠️  unsigned request allowed (dev) — set WHATSAPP_ALLOW_UNSIGNED=true to silence this warning');
        }
        return next();
    }

    if (!rawBody || rawBody.length === 0) {
        console.error('[WEBHOOK] ❌ rejected — raw body missing; ensure express.json verify hook captures req.rawBody');
        return res.status(400).json({ status: 'error', reason: 'raw_body_missing' });
    }

    if (!header || !header.startsWith('sha256=')) {
        console.warn(`[WEBHOOK] ❌ rejected — missing/invalid X-Hub-Signature-256 header (ua="${req.headers['user-agent'] || ''}")`);
        return res.status(401).json({ status: 'error', reason: 'signature_missing' });
    }

    const expected = computeSignature(rawBody, secret);
    // expected already has 'sha256=' prefix; compare the hex payloads.
    const providedHex = header.slice('sha256='.length);
    const expectedHex = expected.slice('sha256='.length);

    if (!safeEqualHex(providedHex, expectedHex)) {
        console.warn(`[WEBHOOK] ❌ rejected — signature mismatch (len=${rawBody.length})`);
        return res.status(401).json({ status: 'error', reason: 'signature_mismatch' });
    }

    return next();
}

module.exports = {
    verifyMetaSignature,
    safeEqualHex,
    computeSignature,
};
