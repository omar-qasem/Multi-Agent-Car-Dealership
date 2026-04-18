# Security Review — Auto Jordan Agentic RAG System

**Reviewer:** Independent security pass, post-P2 remediation
**Date:** 2026-04-18
**Scope:** All changes across P0, P1, P2 tiers (21 tasks). Focus on auth, crypto, input handling, information disclosure, and the new observability surface.
**Test posture at review time:** 179/179 automated tests pass across 14 suites.

---

## Verdict

**Deploy-safe with three HIGH fixes recommended before turning on production traffic.** The crypto and auth foundations are correct; the findings are mostly about reducing attack surface and plugging information-disclosure channels introduced by the new observability work.

---

## HIGH — fix before production

### H1. `/ready` leaks internal state to unauthenticated callers
**Location:** `server/app.js:129-184` — `app.get('/ready', ...)`

The readiness endpoint returns:

- Supabase mode (`supabase` vs `in-memory`), latency, sample row count
- Groq configuration status, model names, TPD exhaustion flag, exhaustion date
- Presence booleans for every WhatsApp credential (`token_set`, `phone_number_id_set`, `verify_token_set`, `app_secret_set`)
- `last_send_signal` with success/failure counts

An attacker hitting `/ready` learns the full dependency topology, whether the database is reachable, and whether the primary Groq model is burned for the day (a signal that lets them time abuse for when the system is on its weaker fallback model). The 503 vs 200 status itself becomes a fingerprinting oracle.

**Fix:** Split into two endpoints:

- `/ready` (public, for orchestrators): return only `{ status: 'ready' | 'not-ready', timestamp, uptime, version }`. No per-dep detail.
- `/api/admin/ready` (auth-gated, mounted on `adminRoutes`): returns the full `checks` block for on-call engineers.

### H2. Login returns the raw JWT in the JSON body
**Location:** `server/middleware/auth.js:202-209`

```js
res.json({
    success: true,
    token,          // ← raw JWT accessible to JavaScript
    csrfToken,
    ...
});
```

The whole point of putting the JWT in an HttpOnly cookie is that a successful XSS can't steal it. By also echoing the token into the JSON body, the SPA reads it into a variable, and any XSS that runs after login completes can grab it from that in-memory scope.

**Fix:** Gate the `token` field on a client-type signal. Browsers get cookie + csrfToken only; CLI clients pass `?client=cli` (or use a separate `/api/auth/login-cli` route) to opt into the raw token.

### H3. JWT lifetime is 7 days with no rotation or refresh
**Location:** `server/config/env.js:67` (`jwtExpiresIn: '7d'`)

A stolen `aj_session` cookie grants admin access for 7 days. There's no refresh mechanism, no token binding, no server-side session revocation list. If anyone gets logged-out administratively, the cookie still works until expiry.

**Fix:** Pick one:

- Short-lived (15-30 min) access JWT + 7-day refresh token in a separate HttpOnly cookie, with a refresh endpoint that rotates both.
- Or: server-side session store (Redis / Supabase table) keyed on a session id inside the JWT; logout invalidates the row, and every `authenticateToken` does a lookup. Adds one round-trip per request but makes logout real.

At minimum, drop the access-JWT TTL to 24h (matching the fallback literal at `auth.js:190`) so the two numbers stop disagreeing.

---

## MEDIUM — worth fixing but not blocking

### M1. `X-Forwarded-For` key-generator trusts the first value
**Location:** `server/middleware/auth.js:224-232`

```js
req.headers['x-forwarded-for']?.split(',')[0]?.trim()
```

Behind Netlify (single trusted proxy, `app.set('trust proxy', 1)`) this is correct — Netlify rewrites the header. But if the app is ever deployed behind zero proxies or multiple, `X-Forwarded-For` is fully attacker-controlled and rate-limit bypass becomes `curl -H "X-Forwarded-For: 1.2.3.4"` with a rotating value.

**Fix:** Prefer `req.ip` (Express resolves this using the `trust proxy` setting) over hand-parsing the header. Document the deployment requirement that exactly one trusted proxy must sit in front.

### M2. PII in structured logs
**Location:** `server/routes/webhook.routes.js:219-230`, `server/utils/logger.js`

Every webhook log line in production JSON includes `phone` (+962…), `name` (customer profile name), and `text_preview` (first 80 chars of the message). Those land in Netlify log storage and whatever downstream tool ingests them. Jordan's Personal Data Protection Law #24/2023 and GDPR (if any EU residents reach out) both treat this as personal data requiring a lawful basis, a retention policy, and subject-access handling.

**Fix:** Either (a) hash the phone number with a per-environment pepper before logging (`sha256(phone + LOG_PEPPER)[:12]` gives you correlation without reversibility), or (b) add a `LOG_REDACT=true` switch that substitutes `phone: '[redacted]'` and `text_preview: null`. Keep full detail in dev.

### M3. SameSite=lax on admin cookies
**Location:** `server/middleware/auth.js:73-81`

`Lax` still allows top-level cross-origin GETs to carry the cookie. For an admin dashboard where no endpoint legitimately accepts links-from-email traffic, `Strict` is safer and costs nothing.

**Fix:** Change to `sameSite: 'strict'`. Verify the login flow still works (the login POST is same-origin so it's fine).

### M4. Dead CSRF secret field
**Location:** `server/config/env.js:69`

```js
csrfSecret: process.env.CSRF_SECRET || (jwtSecret ? `csrf_${jwtSecret.slice(0, 16)}` : 'dev_csrf_secret_change_me'),
```

This field is never read — the CSRF implementation uses `crypto.randomBytes(24)` per session, which is correct. But the derivation-from-JWT-secret pattern is a land mine: if anyone later wires `csrfSecret` into an HMAC-based CSRF, rotating JWT secret would silently invalidate all CSRF tokens, and 16 chars of JWT entropy is weak.

**Fix:** Delete the field. If you later want signed CSRF tokens, require `CSRF_SECRET` as a separate env var with the same length/placeholder checks as `JWT_SECRET`.

### M5. Body-size limit generous for webhook payloads
**Location:** `server/app.js:85` (`limit: '10mb'`)

A legitimate WhatsApp webhook body is well under 10KB. Allowing 10MB on `/webhook` means a malicious caller can tie up Lambda memory/CPU parsing garbage up to signature check.

**Fix:** Split `express.json()` into per-mount limits: `1mb` on `/webhook`, `200kb` everywhere else.

### M6. Webhook rate limit 300/min could drop legit bursts
**Location:** `server/middleware/auth.js:244-250`

Meta can burst higher than 5 req/sec for a viral moment. 300/min is per-IP, and since Meta retries from the same IP pool, a legitimate surge would hit the limit.

**Fix:** Keep the per-IP limit but also exempt requests that carry a valid `X-Hub-Signature-256` from the count — by then we've already proved Meta sent them. Alternatively raise to 600/min and monitor with the new `webhook_requests_total` counter.

---

## LOW / informational

### L1. JWT verification error leaks parse category into logs
`server/middleware/auth.js:141` logs `error.message`, which distinguishes `TokenExpiredError` / `JsonWebTokenError` / `NotBeforeError`. Low-value to an external attacker (they can't see the logs) but leaks through any future log-exposing admin UI.

### L2. Helmet CSP disabled
`server/app.js:47` — `helmet({ contentSecurityPolicy: false })`. Intentional for the React SPA + inline Vite stuff, but production builds should tighten this. Add a production-only CSP with `script-src 'self'`, `connect-src 'self' https://*.supabase.co https://api.groq.com`, `frame-ancestors 'none'`.

### L3. `/debug-env` dev-only leaks env-var presence
Blocked in production (`server/app.js:200-210`). Fine. Consider also requiring auth in dev so it doesn't escape via a port-forwarded preview.

### L4. `markAsRead` swallows all errors silently
`server/services/whatsapp.service.js:136` — the `markAsRead` call's catch only warns. If Meta rotates the access token, markAsRead silently fails forever while the main send path also fails (they use the same token), so this doesn't hide a novel failure mode. OK.

### L5. Metrics endpoint is behind auth but carries no CSRF check
`/api/admin/metrics` is GET, so CSRF middleware short-circuits on line 97 — correct per the OWASP CSRF standard. Noted only so a future reviewer doesn't flag it.

### L6. Login username stays unenumerated (positive)
The login handler runs `bcrypt.compare` against a fake hash on unknown usernames to equalize timing, and returns the same 401 message for both cases. Good. Keep it this way.

---

## Positive findings (explicitly verified correct)

- **HMAC signature verification** uses `crypto.timingSafeEqual` on equal-length buffers, rejects on length mismatch without leaking position, rejects missing/malformed `sha256=` prefix, fails closed in production when `WHATSAPP_APP_SECRET` is unset (500 not bypass).
- **Password hashing** bcryptjs at 12 rounds (strong, ~250ms per compare on Lambda).
- **JWT secret enforcement** requires ≥32 chars in production, rejects common placeholder substrings, refuses to start rather than boot with a guessable default.
- **Double-submit CSRF** correctly exempts GET/HEAD/OPTIONS and Bearer-token requests, correctly compares `x-csrf-token` header to `aj_csrf` cookie.
- **RLS lockdown** (migration 002) revokes all grants from `anon` and `authenticated`, re-enables + forces RLS, adds explicit `anon_deny_all` policies, grants only `service_role`. Idempotent.
- **Partial unique indexes** prevent double-booking (migration 003) and cross-Lambda webhook replay (migration 004). SQLSTATE 23505 is caught and translated to a user-safe response rather than thrown.
- **Non-retryable 4xx classification** for WhatsApp prevents infinite retry amplification on bad payloads.
- **Fail-open DB lookups** for message dedup and loyalty — correct trade-off: double-processing one message is far less bad than stalling the webhook.
- **Raw body capture** (`express.json({ verify })`) scoped to `/webhook` only — no unnecessary memory retention on other routes.
- **Error handler** hides stacks in production, shows them in dev.
- **All sensitive routes** gated by `authenticateToken` (39 handlers across conversations, analytics, management, admin). Spot-checked with grep.
- **Secure cookie flag** gated on `NODE_ENV === 'production'` — correct.
- **Logger** never throws into caller's catch block (wrapped emit with fallback). `JSON.stringify` neutralizes log-injection attempts via newlines/control chars.

---

## Recommended sequence

1. **Before production cutover:** fix H1 (split `/ready`), H2 (drop raw token from login JSON), H3 (shorten JWT TTL or add refresh).
2. **First week in production:** M1 (`req.ip`), M2 (PII redaction toggle), M5 (per-mount body limits).
3. **Second week:** M3 (SameSite=strict), M4 (drop dead csrfSecret), M6 (trust-signed-webhook bypass for rate limit).
4. **Backlog:** L1/L2/L3 — nice-to-haves that don't move the risk needle.

No findings required a test change; all existing regressions still pass. Every HIGH-priority fix is a localized edit (single file, single function) and can be shipped as a separate PR with its own regression test.
