/**
 * Netlify Serverless Function - نقطة الدخول الوحيدة للـ Backend
 *
 * كل الطلبات تمر من هنا:
 * /webhook → Express webhook router
 * /api/*   → Express API routes
 * /health  → Health check
 */

// IMPORTANT: set NETLIFY before requiring server/app so any module that
// reads process.env at load time (webhook.routes.js, etc.) sees it. The
// earlier placement (after require) caused the Background Function
// dispatch to silently fall back to sync mode — see prod log 2026-04-22.
process.env.NETLIFY = 'true';

const serverless = require('serverless-http');
const app = require('../../server/app');

// إعداد serverless-http مع معالجة المسار
/**
 * Sanitize the incoming path — protects against path traversal,
 * null byte injection, and backslash smuggling.
 */
function sanitizePath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return '/';

  // Reject null bytes and control characters
  if (/[\x00-\x1f]/.test(rawPath)) return '/';

  // Normalize backslashes to forward slashes
  let p = rawPath.replace(/\\/g, '/');

  // Strip netlify function prefix
  p = p.replace(/^\/?\.netlify\/functions\/api/, '') || '/';

  // Reject traversal sequences
  if (p.includes('..') || p.includes('//..') || p.includes('/./')) return '/';

  // Ensure leading slash
  if (!p.startsWith('/')) p = '/' + p;

  // Cap length to prevent abuse
  if (p.length > 2048) return '/';

  return p;
}

const handler = serverless(app, {
  request: (req, event) => {
    // Separate rawPath from any embedded query (event.path should not contain one,
    // but be defensive in case some providers embed it)
    const rawPath = (event.path || req.url || '/').split('?')[0];
    const safePath = sanitizePath(rawPath);

    // Build query string from Netlify's parsed params (authoritative source)
    let queryString = '';
    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
      queryString = '?' + Object.entries(event.queryStringParameters)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v == null ? '' : v)}`)
        .join('&');
    }

    req.url = safePath + queryString;
    console.log('[NETLIFY FUNCTION] Path:', safePath);
    return req;
  },
});

module.exports = { handler };
