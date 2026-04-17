# Auto Jordan — QA Remediation Work Plan

**Source:** `QA_REVIEW_REPORT.md` (2026-04-17)
**Plan owner:** Engineering lead
**Target window:** 6 sprints (≈12 weeks)
**Guiding principle:** Ship blockers first, harden, then polish. Every change ships behind a feature flag where possible and is proven by a golden-set test before it reaches production.

---

## 0. Reading guide

Each task has this shape:

```
TASK-ID · <title>
  Maps to:        <finding IDs from QA_REVIEW_REPORT.md>
  Severity:       Critical / High / Medium / Low
  Files:          paths touched
  Effort:         XS (≤2h) | S (≤1d) | M (2–3d) | L (4–7d) | XL (>1w)
  Dependencies:   prerequisite TASK-IDs
  Acceptance:     how we know it's done
  Verification:   test, metric, or manual check
```

Phases are executed in order. Inside a phase, tasks can run in parallel if dependencies allow.

---

## 1. Phase timeline at a glance

| Phase | Window | Theme | Exit criteria |
|---|---|---|---|
| **P0 — Stop-the-bleed** | Sprint 1 | Critical production blockers | No "ghost bookings", no forged webhooks, no plaintext auth |
| **P1 — Integrity & Concurrency** | Sprint 2 | Data correctness, RLS, timezone, concurrency | Booking path is atomic, timezone-safe, logged |
| **P2 — Architecture & Pipeline** | Sprint 3 | Ack-then-process, observability, structured tool contract | Webhook always 200 in <1s; every request traceable |
| **P3 — AI quality** | Sprint 4 | Prompting, grounding, classifier, golden-set | No hallucinated cars; regressions caught in CI |
| **P4 — Frontend & UX** | Sprint 5 | Auth cookie, validation, polling, a11y | Admin app survives XSS drill and a11y audit |
| **P5 — Hardening & Polish** | Sprint 6 | Docs, i18n scaffolding, cleanup, retro | Long-tail items closed or explicitly deferred |

---

## 2. Phase P0 — Stop-the-bleed (Sprint 1, Week 1–2)

Goal: remove the three production risks that can cause customer harm or account compromise today.

### P0-01 · Verify Meta webhook HMAC signatures
- **Maps to:** 5.1
- **Severity:** Critical
- **Files:** `server/routes/webhook.routes.js`, `server/app.js`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:**
  - `X-Hub-Signature-256` computed with `APP_SECRET` and compared in constant time.
  - Raw body preserved via `express.raw({ type: 'application/json' })` on the webhook route only.
  - Requests with missing or mismatched signatures return `401` and are logged with `requestId`.
- **Verification:** Replay a captured Meta payload with a tampered byte — server rejects. Unit test in `tests/webhook.signature.test.js`.

### P0-02 · Fix `book_maintenance` required fields + slot format
- **Maps to:** 2.1, 2.2
- **Severity:** Critical
- **Files:** `server/services/agent-tools.js`, `server/services/gemini.service.js` (system prompt), `server/database/db.js`
- **Effort:** M
- **Dependencies:** none
- **Acceptance:**
  - `required` includes `preferred_time`.
  - Internal canonical time is 24-hour `"HH:mm"`; display format is computed at render.
  - Slot values validated against a single `TIME_SLOTS` enum per branch; unknown time → tool returns structured error (no default).
  - Existing bookings backfilled/migrated to canonical format.
- **Verification:** Unit test for each branch's slots; golden-set conversation that collects "Sunday 10am" results in `"10:00"` in DB.

### P0-03 · Never silently accept writes during Supabase outage
- **Maps to:** 5.14, 2.11
- **Severity:** Critical
- **Files:** `server/database/db.js`, `server/services/agent-tools.js` (write handlers), `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** P2-01 (queue) if implementing retry; standalone for graceful-fail message
- **Acceptance:**
  - Write tools return `{ok: false, errorCode: 'DB_DOWN', userMessage}` when Supabase write fails.
  - In-memory fallback is **read-only** when Supabase is unavailable (no writes persisted there).
  - Customer-facing message: "سجلنا طلبك وبنرجعلك بأقرب وقت" plus a pending-ticket ID.
- **Verification:** Integration test that mocks Supabase down, asserts the user gets the graceful message and no phantom booking row.

### P0-04 · Replace silent write-tool disabling on fallback model
- **Maps to:** 2.11
- **Severity:** Critical
- **Files:** `server/services/gemini.service.js`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:**
  - Remove the code path that strips WRITE_TOOLS from the toolbelt on `_primaryModelExhausted=true`.
  - If fallback model can't reliably call tools, return a deterministic Arabic degraded-mode reply that logs a support ticket and promises a human callback.
- **Verification:** Unit test that forces `_primaryModelExhausted=true` and asserts either tools are still exposed or a ticket row is inserted.

### P0-05 · Migrate passwords to bcrypt + enforce JWT secret
- **Maps to:** 5.2, 5.3
- **Severity:** Critical
- **Files:** `server/middleware/auth.js`, `server/app.js` (startup check), a migration script
- **Effort:** M
- **Dependencies:** none
- **Acceptance:**
  - `bcrypt.compare` with 10–12 rounds; no plaintext comparison remains.
  - Startup aborts if `JWT_SECRET` is missing or shorter than 32 chars.
  - Credentials rotated post-migration; old hash (if any) invalidated.
- **Verification:** Unit test for login success/failure; start-up test asserts process exits with missing `JWT_SECRET`.

### P0-06 · Enable Supabase RLS on all public tables
- **Maps to:** 5.12
- **Severity:** Critical
- **Files:** `server/database/migrations/00X_rls.sql` (new), deployment runbook
- **Effort:** M
- **Dependencies:** P0-05 for actor identity shape
- **Acceptance:**
  - RLS enabled on: `bookings`, `customers`, `conversation_states`, `purchase_inquiries`, `support_tickets`, `promotions`, `cars`, `parts`.
  - Policies: service role full access; anon role zero access by default.
  - Confirm client bundle does not contain the service-role key.
- **Verification:** Query with anon key returns 0 rows/403; with service role returns rows. Bundle grep in CI blocks `service_role` leaks.

### P0-07 · Move JWT out of `localStorage` into HttpOnly cookie
- **Maps to:** 6.1, 6.11
- **Severity:** Critical
- **Files:** `server/middleware/auth.js`, `server/routes/auth.routes.js`, `client/src/context/AuthContext.jsx`, `client/src/api/*`
- **Effort:** M
- **Dependencies:** P0-05
- **Acceptance:**
  - Login sets `auth` cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - Client-side axios no longer sets `Authorization` from storage.
  - CSRF: double-submit token issued on login; required on mutation endpoints.
- **Verification:** Manual XSS drill (inject `<img src=x onerror=fetch(...))>` — session not exfiltrated. Automated test hits a mutation without CSRF token and gets 403.

**P0 exit gate:**
- All P0 tasks deployed to staging.
- Smoke test: (a) forge a webhook → rejected; (b) book via WhatsApp → row in Supabase with canonical time; (c) kill Supabase → user gets graceful Arabic message; (d) admin login works via cookie, no JWT in `localStorage`.

---

## 3. Phase P1 — Integrity & Concurrency (Sprint 2, Week 3–4)

### P1-01 · Fix `check_branch_availability` timezone + closed-day config
- **Maps to:** 2.3, 2.4
- **Severity:** Critical / High
- **Files:** `server/services/agent-tools.js`, `server/database/migrations/00X_branch_hours.sql`
- **Effort:** M
- **Dependencies:** P0-02
- **Acceptance:**
  - Use `date-fns-tz` (or `Temporal`) with `Asia/Amman` everywhere dates are parsed.
  - New `branch_hours` table (branch_id, weekday, open, close, closed) + holiday overrides.
  - Ramadan flag toggled by config key `RAMADAN_HOURS=true`.
- **Verification:** Unit tests across DST boundaries (Jordan no longer observes DST since 2022 but keep the test), Fridays, and an engineered Saturday edge case.

### P1-02 · Booking concurrency — atomic upsert
- **Maps to:** 2.5
- **Severity:** High
- **Files:** `server/database/migrations/00X_bookings_unique.sql`, `server/database/db.js`
- **Effort:** M
- **Dependencies:** P0-02 (canonical time), P1-01 (closed days)
- **Acceptance:**
  - `UNIQUE (branch, date, time)` constraint on `bookings`.
  - Write path uses `INSERT … ON CONFLICT` (via RPC) and handles conflict with a user-facing "this slot was just taken" message in Arabic.
- **Verification:** Concurrent insert test using two async calls to same slot → exactly one succeeds.

### P1-03 · Escape `%`/`_`/`\` for all user-input `.ilike`
- **Maps to:** 2.6, 5.6
- **Severity:** High
- **Files:** `server/database/db.js`, `server/services/agent-tools.js`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:**
  - Helper `escapeIlike(str)` replaces `%`, `_`, `\` with escaped forms and is used in every `.ilike` and `.or` with user input.
  - Long-term: migrate car/part search to `tsvector` full-text search.
- **Verification:** Unit test where input `%` returns zero inventory, not all of it.

### P1-04 · Normalize phone numbers to E.164 at the edge
- **Maps to:** 2.10, 5.8
- **Severity:** High
- **Files:** `server/routes/webhook.routes.js`, `server/middleware/normalizePhone.js` (new), `server/database/migrations/00X_phone_normalize.sql`
- **Effort:** M
- **Dependencies:** P0-01 (signature verify so normalization doesn't corrupt raw-body hash)
- **Acceptance:**
  - All inbound phones normalized via `libphonenumber-js` with Jordan default.
  - One-time backfill migration normalizes existing `customers.phone`, `bookings.phone`, etc.
  - Lookup layer normalizes before comparison.
- **Verification:** Test cases: `+962…`, `962…`, `00962…`, `07XX…` all map to the same canonical form.

### P1-05 · Per-tool timeouts + structured error contract
- **Maps to:** 2.12, 2.13
- **Severity:** High / Medium
- **Files:** `server/services/agent-tools.js`, `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** none
- **Acceptance:**
  - Every tool handler wrapped in `Promise.race(handler(), timeout(3000))`.
  - Return shape standardized: `{ok, data?, errorCode?, userMessage?}`.
  - LLM2 prompt updated with an explicit rule: when `ok=false`, explain `userMessage` to the customer, do not retry, log a ticket.
- **Verification:** Unit tests for each tool's timeout + error path.

### P1-06 · Fix `updateCustomerLoyalty` race
- **Maps to:** 5.7
- **Severity:** High
- **Files:** `server/database/rpc/increment_loyalty.sql` (new RPC), `server/database/db.js`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:**
  - Supabase RPC performs atomic `UPDATE … SET points = points + $1 … RETURNING points`.
  - Client-side read-modify-write removed.
- **Verification:** Concurrency test: 20 parallel increments of +10 land on +200.

### P1-07 · Input length caps on free-text fields
- **Maps to:** 5.16
- **Severity:** Medium
- **Files:** `server/routes/*.js`, shared Zod schemas
- **Effort:** S
- **Dependencies:** none
- **Acceptance:** Fields like `description`, `customer_message`, booking notes capped at 2 KB server-side; overflow returns 413 with Arabic error.
- **Verification:** Fuzz test with 10 KB payloads.

**P1 exit gate:** Booking path is atomic, timezone-correct, phone-normalized, wildcard-safe, and every tool returns a typed result with a hard deadline.

---

## 4. Phase P2 — Architecture & Pipeline (Sprint 3, Week 5–6)

### P2-01 · Ack-then-process webhook with background worker
- **Maps to:** 3.1, 3.2
- **Severity:** Critical / High
- **Files:** `netlify/functions/api.js`, new `netlify/functions/whatsapp-worker-background.js`, `server/routes/webhook.routes.js`, `server/database/migrations/00X_webhook_events.sql`
- **Effort:** L
- **Dependencies:** P0-01 (signature), P1-04 (phone normalize)
- **Acceptance:**
  - Inbound webhook: verify signature → insert into `webhook_events` with `UNIQUE(message_id)` → return 200 in <1 s → enqueue.
  - Worker (Netlify Background Function or queue) runs the AI pipeline asynchronously.
  - Idempotent: duplicate `message_id` is a no-op.
- **Verification:** Meta webhook tester passes; duplicate POSTs don't cause a double reply.

### P2-02 · Request-scoped context + observability
- **Maps to:** 1.3, 1.5, 5.13
- **Severity:** High
- **Files:** `server/context.js` (new), `server/utils/logger.js`, `server/services/*.js`, `server/database/migrations/00X_audit_log.sql`
- **Effort:** M
- **Dependencies:** P2-01 (so we have a clean worker entry-point to attach context)
- **Acceptance:**
  - `requestId` (ULID) generated on webhook receipt, propagated through classifier → RAG → LLM → tools → DB calls.
  - Structured JSON logs with `requestId`, `phone`, `intent`, `tool`, `durationMs`, `ok`.
  - `audit_log(action, entity, entity_id, actor, before, after, ts, request_id)` table + insert on every write.
- **Verification:** Given a `requestId`, I can pull every log line and every DB write for that conversation.

### P2-03 · Validation stage between tool result and LLM2
- **Maps to:** 3.6
- **Severity:** High
- **Files:** `server/services/toolSchemas.js` (new, Zod), `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** P1-05 (structured error contract)
- **Acceptance:** Each tool has a Zod output schema; post-dispatch, payloads are validated. Invalid payloads short-circuit to a structured tool error the LLM can reason about.
- **Verification:** Unit test with intentionally malformed tool output → LLM2 sees error, not hallucination.

### P2-04 · Persistent dedup table (part of P2-01)
- Covered by P2-01 acceptance. Kept here as an explicit line-item for the project board.

### P2-05 · Circuit breaker on Groq
- **Maps to:** 3.4
- **Severity:** Medium
- **Files:** `server/services/gemini.service.js`, `server/utils/circuitBreaker.js` (new)
- **Effort:** S
- **Dependencies:** P2-02 (logging)
- **Acceptance:**
  - 5 failures in 60 s → breaker open for 30 s; half-open probe before closing.
  - Open-state behavior: canned Arabic fallback reply, log support ticket.
- **Verification:** Inject Groq 500s; breaker opens; user still receives a reply within 1 s.

### P2-06 · Tool budget per category + replan arm
- **Maps to:** 3.3, 4.5
- **Severity:** High / Medium
- **Files:** `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** P2-03
- **Acceptance:** Up to 5 tool calls total with ≤2 READ and ≤1 WRITE. On zero-result tool, LLM1 can replan once or ask a clarifying question.
- **Verification:** Scenario test where `search_cars` returns empty → system asks "بدك سيارة بأي موديل تقريباً؟" instead of dead-ending.

### P2-07 · Application-layer rate limit keyed by phone
- **Maps to:** 5.5
- **Severity:** High
- **Files:** `server/middleware/rateLimitPhone.js` (new), `server/routes/webhook.routes.js`
- **Effort:** S
- **Dependencies:** P1-04
- **Acceptance:** 30 messages / 5 min per phone; breach returns a polite Arabic throttle message.
- **Verification:** Burst test hits the limit.

### P2-08 · Remove `/debug-env`; gate error stacks on `DEBUG_ERRORS`
- **Maps to:** 5.9, 5.10
- **Severity:** Medium
- **Files:** `server/app.js`
- **Effort:** XS
- **Dependencies:** none
- **Acceptance:** `/debug-env` deleted; stacks shown only when `DEBUG_ERRORS=true`.
- **Verification:** Preview deploy no longer exposes env names.

**P2 exit gate:** Webhook returns 200 OK in <1 s; every conversation has a `requestId`; malformed tool outputs never reach the user.

---

## 5. Phase P3 — AI Quality (Sprint 4, Week 7–8)

### P3-01 · Split the monolithic system prompt
- **Maps to:** 4.1
- **Severity:** High
- **Files:** `server/services/prompts/` (new directory with `persona.ar.txt`, `rules.ar.txt`, `tools.ar.txt`, `format.ar.txt`), `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** P2-02 (to log prompt version)
- **Acceptance:** Prompt composed at runtime; version string logged per request; edits to one section don't silently change others.
- **Verification:** Golden-set regression (see P3-06) shows no deltas when refactoring from monolith to composed.

### P3-02 · Inject `collected_entities` explicitly into prompt
- **Maps to:** 4.2
- **Severity:** High
- **Files:** `server/services/gemini.service.js`, `server/database/db.js`
- **Effort:** S
- **Dependencies:** P3-01
- **Acceptance:** System prompt ends with an "المعلومات المعروفة عن العميل" section listing collected entities; LLM stops asking for re-confirmation.
- **Verification:** Multi-turn booking test doesn't re-ask for car make after turn 5.

### P3-03 · Raise RAG injection cap for car/parts intents
- **Maps to:** 4.3
- **Severity:** High
- **Files:** `server/services/rag.service.js`, `server/services/gemini.service.js`
- **Effort:** S
- **Dependencies:** P3-01 (so budget logic is one place)
- **Acceptance:** Intent-aware cap — 1,500 chars for `price`/`purchase`/`parts`; 300 for `greeting`; dynamic if token budget allows more.
- **Verification:** A "show me sedans under 8k JOD" query returns ≥5 rows without truncation.

### P3-04 · Source-grounding post-check
- **Maps to:** 4.4
- **Severity:** High
- **Files:** `server/services/grounding.js` (new), `server/services/gemini.service.js`
- **Effort:** M
- **Dependencies:** P3-03
- **Acceptance:** Reply text scanned for make/model/price tokens; any token not present in retrieved context either triggers a repair re-prompt or is stripped, with a log line.
- **Verification:** Seed Groq to hallucinate a non-existent model; post-check removes it.

### P3-05 · Classifier — word-boundary regex + deeper negation
- **Maps to:** 4.6, 4.7, 4.10
- **Severity:** High / Medium
- **Files:** `server/services/classifier.js`, `server/utils/arabicNormalize.js` (new, per 1.4)
- **Effort:** M
- **Dependencies:** none
- **Acceptance:**
  - Makes/models matched with `(^|\\s)…(\\s|$)` on the normalized string.
  - Known collisions (e.g., "كيا" ⊂ "مكيا") blocklisted.
  - Negation window ±3 tokens plus affirmative-counterpart override.
  - Digit normalization canonicalized once at the edge.
- **Verification:** Add 20 classifier unit tests including Jordanian idioms.

### P3-06 · Golden-set evaluation harness
- **Maps to:** 4.9
- **Severity:** High
- **Files:** `tests/golden/*.json`, `tests/runGolden.js`, CI config
- **Effort:** L
- **Dependencies:** P2-02 (requestId), P3-01..P3-05
- **Acceptance:**
  - ≥40 Arabic conversation fixtures covering booking, price, parts, promotions, ambiguous intents, negation, code-mix.
  - Each fixture specifies expected intent, expected tool calls (name + required-field subset), and response assertions (regex/substring).
  - CI runs against Groq with retries; flaky threshold documented.
- **Verification:** CI gate blocks merges that break >1 fixture.

### P3-07 · Tool description expansion ("Use when / Don't use when")
- **Maps to:** 4.8
- **Severity:** Medium
- **Files:** `server/services/agent-tools.js`
- **Effort:** S
- **Dependencies:** P3-06 to measure impact
- **Acceptance:** Every tool's `description` includes 1–3 positive and 1–2 negative examples.
- **Verification:** Golden-set pass rate improves vs. baseline (log-before, log-after).

### P3-08 · PII guardrail before LLM2 emits
- **Maps to:** 4.12
- **Severity:** High
- **Files:** `server/services/piiGuard.js` (new), `server/services/gemini.service.js`, `server/services/agent-tools.js` (submit_support_ticket — 2.9)
- **Effort:** M
- **Dependencies:** P3-04
- **Acceptance:**
  - Retrieved context is scanned for phone, national ID, email patterns; anything not matching the current caller's normalized phone is redacted.
  - `submit_support_ticket.description` is scrubbed with the same regex before persistence.
- **Verification:** Seed a conversation_state for phone A, switch call to phone B, assert A's number never appears in B's reply.

### P3-09 · Hybrid RAG — keyword + pgvector (optional but recommended)
- **Maps to:** 3.5
- **Severity:** Medium
- **Files:** `server/database/migrations/00X_pgvector.sql`, `server/services/rag.service.js`, embedding worker
- **Effort:** L
- **Dependencies:** P3-06 to measure
- **Acceptance:** pgvector column on `cars` and `promotions`, backfilled; RAG merges keyword + vector hits; latency stays under the 1.5 s cap.
- **Verification:** A paraphrase query ("عندي ميزانية ضيقة") returns budget cars with no `budget` entity detected.

**P3 exit gate:** Golden-set passes ≥95%; hallucinations caught in post-check; classifier false-positive rate on a 200-message sample <3%.

---

## 6. Phase P4 — Frontend & UX (Sprint 5, Week 9–10)

### P4-01 · Dedicated axios instance (no global `Authorization`)
- **Maps to:** 6.2
- **Severity:** High
- **Files:** `client/src/api/client.js` (new), all API call sites
- **Effort:** S
- **Dependencies:** P0-07
- **Acceptance:** One `apiClient = axios.create({withCredentials: true})`; no `axios.defaults.headers.common.*` mutation anywhere.
- **Verification:** Grep CI rule fails on `axios.defaults.headers`.

### P4-02 · Booking form input validation (Zod)
- **Maps to:** 6.8
- **Severity:** High
- **Files:** `client/src/forms/BookingForm.jsx`, `client/src/schemas/booking.ts` (new)
- **Effort:** M
- **Dependencies:** P0-02 (canonical time format)
- **Acceptance:** Date must be today or later; time in the branch's slot enum; Jordanian phone pattern; submit disabled until valid.
- **Verification:** Manual test + unit test for the schema.

### P4-03 · Visibility-gated polling + Realtime where possible
- **Maps to:** 6.3
- **Severity:** Medium
- **Files:** `client/src/pages/Conversations.jsx`, Supabase client config
- **Effort:** M
- **Dependencies:** none
- **Acceptance:** Polling pauses when `document.hidden`; optional Supabase Realtime subscription to `conversations` for live updates.
- **Verification:** Chrome DevTools Network tab: no requests when tab is hidden.

### P4-04 · Single AudioContext ref
- **Maps to:** 6.4
- **Severity:** Medium
- **Files:** `client/src/pages/Conversations.jsx`
- **Effort:** XS
- **Dependencies:** none
- **Acceptance:** One `useRef(null)` AudioContext; resumed on first user gesture.
- **Verification:** Safari/Chrome console clean over 50 messages.

### P4-05 · Replace `alert()` with toast + log
- **Maps to:** 6.5
- **Severity:** Medium
- **Files:** `client/src/components/Toast.jsx` (new or lib), `client/src/pages/Bookings.jsx`, `client/src/pages/Conversations.jsx`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:** No `alert(` calls remain; errors surface as dismissible toasts; raw error logged to console.
- **Verification:** CI grep rule on `\\balert\\(`.

### P4-06 · Locale fix `ar-JO` + Gregorian calendar helper
- **Maps to:** 6.6
- **Severity:** Medium
- **Files:** `client/src/utils/formatDate.js` (new), all date render sites
- **Effort:** S
- **Dependencies:** none
- **Acceptance:** Single `formatDate(d, opts)` used everywhere; default `ar-JO` + `calendar: 'gregory'`.
- **Verification:** Snapshot test for 2026-04-17 renders `١٧ أبريل ٢٠٢٦` (Gregorian, Arabic digits).

### P4-07 · Optimistic UI with rollback (React Query or SWR)
- **Maps to:** 6.9
- **Severity:** Medium
- **Files:** `client/src/pages/Bookings.jsx`, `client/src/hooks/useBookings.js`
- **Effort:** M
- **Dependencies:** P4-05
- **Acceptance:** Mutations use `onMutate` to update cache, `onError` to rollback, `onSettled` to revalidate.
- **Verification:** Force a 500 → UI reverts to prior state.

### P4-08 · Route-level error boundary
- **Maps to:** 6.10
- **Severity:** Medium
- **Files:** `client/src/App.jsx`, `client/src/components/ErrorBoundary.jsx`
- **Effort:** S
- **Dependencies:** none
- **Acceptance:** A thrown render error in a child shows a fallback with a "reload" button; rest of the app not blanked.
- **Verification:** Test component that throws on mount → boundary catches.

### P4-09 · a11y baseline with axe-core
- **Maps to:** 6.13
- **Severity:** Medium
- **Files:** `client/package.json`, `client/src/main.jsx`, component fixes
- **Effort:** M
- **Dependencies:** P4-08 (so boundaries are labeled too)
- **Acceptance:** `@axe-core/react` runs in dev; all critical and serious violations fixed; RTL/LTR mixing verified.
- **Verification:** `axe` dev report is clean on the top 5 routes.

### P4-10 · Contract alignment — camelCase at API boundary
- **Maps to:** 1.6, 6.7
- **Severity:** Medium
- **Files:** `server/routes/*.js`, `server/utils/caseMap.js` (new), all client call sites
- **Effort:** M
- **Dependencies:** none
- **Acceptance:** All API responses camelCase; snake_case isolated to Supabase query layer; shared Zod/TypeScript types published to both client and server.
- **Verification:** Contract tests for every endpoint.

**P4 exit gate:** Admin app survives an XSS drill, passes axe a11y baseline, and has no `alert()` or global axios header.

---

## 7. Phase P5 — Hardening & Polish (Sprint 6, Week 11–12)

### P5-01 · Persistence adapter unifying IDs and shapes
- **Maps to:** 1.1
- **Severity:** High
- **Files:** `server/database/adapter.js` (new), `server/database/db.js`
- **Effort:** L
- **Dependencies:** P0-03 (clean write path), P1-04
- **Acceptance:** One return shape per entity; UUID v4 generation in both Supabase and in-memory paths; caller code doesn't branch on backend.
- **Verification:** Toggle Supabase off in test env; all integration tests still pass.

### P5-02 · Tool module split + registry
- **Maps to:** 1.2
- **Severity:** Medium
- **Files:** `server/services/tools/` (new tree)
- **Effort:** M
- **Dependencies:** P1-05, P2-03
- **Acceptance:** `tools/schemas.js`, `tools/read/*.js`, `tools/write/*.js`, `tools/index.js` registry exporting `{name, category, sideEffects, schema, handler}`.
- **Verification:** `registry.listReadTools()` and `listWriteTools()` return expected sets.

### P5-03 · Arabic normalization utility (dedup)
- **Maps to:** 1.4
- **Severity:** Low
- **Files:** `server/utils/arabicNormalize.js` (new)
- **Effort:** S
- **Dependencies:** P3-05 (already introduced, now centralize callers)
- **Acceptance:** Single `normalize(str)` and `tokenize(str)`; all duplicated copies removed.
- **Verification:** Snapshot tests on a fixture of common Jordanian phrases.

### P5-04 · Bounds-check `calculate_financing` and cap `compare_cars`
- **Maps to:** 2.7, 2.8
- **Severity:** Medium
- **Files:** `server/services/agent-tools.js`
- **Effort:** S
- **Dependencies:** P1-05
- **Acceptance:** Validator returns `{ok:false}` on out-of-range inputs; `compare_cars` schema enforces `maxItems: 4`.
- **Verification:** Unit tests for negative down payment, 200-month term, 30% rate, 20-item compare.

### P5-05 · Short-lived access + persistent refresh tokens
- **Maps to:** 5.4
- **Severity:** High
- **Files:** `server/middleware/auth.js`, `server/routes/auth.routes.js`, `server/database/migrations/00X_refresh_tokens.sql`
- **Effort:** M
- **Dependencies:** P0-07
- **Acceptance:** Access token 15 min, refresh token 14 days stored in Supabase with `revoked_at`; logout revokes refresh across instances.
- **Verification:** Logout from one tab invalidates another tab's session on next refresh call.

### P5-06 · Timestamps from Supabase only
- **Maps to:** 5.15
- **Severity:** Medium
- **Files:** `server/database/db.js`, migrations for `DEFAULT now()`
- **Effort:** S
- **Dependencies:** P5-01
- **Acceptance:** App layer stops sending `created_at`; Supabase `DEFAULT now()` is authoritative.
- **Verification:** Spot-check that two events 10 s apart have increasing `created_at` regardless of lambda host.

### P5-07 · CORS tightening
- **Maps to:** 5.11
- **Severity:** Low
- **Files:** `server/app.js`
- **Effort:** XS
- **Dependencies:** none
- **Acceptance:** No-origin allowed only on `/api/webhook`; strict allowlist elsewhere.
- **Verification:** Manual curl test from disallowed origin → blocked.

### P5-08 · i18n scaffolding
- **Maps to:** 6.12
- **Severity:** Low
- **Files:** `client/src/i18n/*`, key extraction pass
- **Effort:** M
- **Dependencies:** P4-05, P4-06
- **Acceptance:** `react-i18next` installed; default `ar`; keys defined for top-10 strings; framework in place for future `en`.
- **Verification:** Toggle test locale, confirm rendering switches.

### P5-09 · Documentation + runbook
- **Maps to:** cross-cutting
- **Severity:** Medium
- **Files:** `docs/architecture.md`, `docs/runbook.md`, `docs/prompts.md`
- **Effort:** M
- **Dependencies:** all prior
- **Acceptance:** Architecture diagram updated; runbook covers Groq outage, Supabase outage, Meta outage; prompts directory documented.
- **Verification:** New-hire readthrough yields no unanswered "how does X work?" after 30 min.

**P5 exit gate:** All findings from `QA_REVIEW_REPORT.md` either closed or explicitly deferred with a written rationale.

---

## 8. Cross-cutting workstreams (run alongside all phases)

### CC-1 · Feature flags
Every user-visible behavior change (graceful-fail message, ack-then-process, grounding) ships behind a flag (`LaunchDarkly` or a Supabase `feature_flags` table). Flags default off in production until the golden-set passes.

### CC-2 · Staging parity
Maintain a staging Supabase project mirroring prod schema. All P0–P2 tasks must ship to staging first and pass smoke tests for 24 h before promoting.

### CC-3 · Golden-set as the gate
Starting in P3-06, the golden-set is the merge gate for any change touching classifier, RAG, tools, or prompts. Each regression requires a written RCA.

### CC-4 · Data migrations are separated from code deploys
All SQL migrations land in `server/database/migrations/` with a timestamp prefix. They run via a deploy hook before the app deploys. No destructive migrations without a backup snapshot.

### CC-5 · Rollback plan per phase
Every phase has a documented rollback. Example for P2-01: revert the worker function, keep the `webhook_events` table (idempotent read), flip feature flag `USE_BACKGROUND_WORKER=false`.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bcrypt migration breaks existing admin logins | Medium | High | One-off script hashes existing plaintext on first login; force password reset for staff with a reset email. |
| HMAC verification rejects legitimate Meta traffic | Low | Critical (bot goes silent) | Ship in shadow mode first — log mismatches for 48 h, then enforce. |
| Moving to background worker changes reply latency perception | Medium | Medium | Add a first-turn "عالوضع، كتبلك بثواني" ack (optional, don't spam). |
| pgvector backfill is slow | Medium | Low | Run in a one-off job off the critical path; system degrades gracefully to keyword-only. |
| Golden-set is flaky against Groq | High | Medium | Use recorded-cassette mode in CI; live runs only in nightly jobs. |
| RLS lockdown breaks an undocumented internal caller | Medium | High | Inventory every Supabase caller before flipping RLS; stage for 1 week with policies in permissive-log mode. |

---

## 10. Definition of Done (system-level)

A feature/phase is "done" only when all four hold:

1. Code merged with tests (unit + at least one integration test).
2. Golden-set passes at or above the pre-change baseline.
3. Staging smoke test green for 24 h under synthetic load.
4. Runbook updated if the change affects incident response (auth, DB, webhook, tools, prompts).

---

## 11. Backlog — explicitly out of scope for this plan

These were noted in the review but are not blocking and will be tracked separately:

- English admin view (requires i18n per P5-08).
- Full CRM export / BI dashboards.
- Voice / WhatsApp audio messages.
- Multi-tenant (multi-dealership) support.
- Real-time agent takeover from the admin app.

---

**Appendix A — Traceability matrix**

Every QA finding maps to at least one task:

- **1.1** → P5-01  ·  **1.2** → P5-02  ·  **1.3** → P2-02  ·  **1.4** → P5-03  ·  **1.5** → P2-02  ·  **1.6** → P4-10
- **2.1, 2.2** → P0-02  ·  **2.3, 2.4** → P1-01  ·  **2.5** → P1-02  ·  **2.6** → P1-03  ·  **2.7, 2.8** → P5-04  ·  **2.9** → P3-08  ·  **2.10** → P1-04  ·  **2.11** → P0-04  ·  **2.12, 2.13** → P1-05
- **3.1, 3.2** → P2-01  ·  **3.3** → P2-06  ·  **3.4** → P2-05  ·  **3.5** → P3-09  ·  **3.6** → P2-03
- **4.1** → P3-01  ·  **4.2** → P3-02  ·  **4.3** → P3-03  ·  **4.4** → P3-04  ·  **4.5** → P2-06  ·  **4.6, 4.7, 4.10** → P3-05  ·  **4.8** → P3-07  ·  **4.9** → P3-06  ·  **4.11** → P3-05  ·  **4.12** → P3-08
- **5.1** → P0-01  ·  **5.2, 5.3** → P0-05  ·  **5.4** → P5-05  ·  **5.5** → P2-07  ·  **5.6** → P1-03  ·  **5.7** → P1-06  ·  **5.8** → P1-04  ·  **5.9, 5.10** → P2-08  ·  **5.11** → P5-07  ·  **5.12** → P0-06  ·  **5.13** → P2-02  ·  **5.14** → P0-03  ·  **5.15** → P5-06  ·  **5.16** → P1-07
- **6.1** → P0-07  ·  **6.2** → P4-01  ·  **6.3** → P4-03  ·  **6.4** → P4-04  ·  **6.5** → P4-05  ·  **6.6** → P4-06  ·  **6.7** → P4-10  ·  **6.8** → P4-02  ·  **6.9** → P4-07  ·  **6.10** → P4-08  ·  **6.11** → P0-07  ·  **6.12** → P5-08  ·  **6.13** → P4-09
