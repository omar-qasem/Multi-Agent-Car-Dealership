# Senior QA Engineering Review — Auto Jordan Agentic RAG System

**Reviewer scope:** Full-stack agentic RAG system powering an Arabic/Jordanian car dealership on WhatsApp (Node/Express backend, React/Tailwind frontend, Supabase persistence, Netlify serverless deploy, Groq LLM with llama-3.3-70b primary + llama-3.1-8b fallback).

**Review date:** 2026-04-17
**Methodology:** Code-level inspection of services, tools, routes, middleware, database layer, and frontend state handling. Findings are grouped by the six mandated review areas and closed with a priority action list.

---

## 1. Deep Codebase Review

### 1.1 Service & component map

The system is organized around a clean two-stage pipeline: (a) a pre-LLM fast path (`classifier.js`) that returns canned responses or tags intent/entities, (b) an LLM orchestrator (`gemini.service.js`) that optionally runs function-calling against 13 tools in `agent-tools.js`, with a retrieval-augmentation hop through `rag.service.js` that pre-fetches Supabase rows into the system prompt. Persistence is routed through `database/db.js`, which transparently falls back to in-memory stores when Supabase is unavailable. Inbound traffic enters via `webhook.routes.js` (WhatsApp) or REST routes guarded by `middleware/auth.js`. The Netlify Lambda shim is in `netlify/functions/api.js`.

### 1.2 Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1.1 | **Dual persistence drift.** `db.js` returns rows in two shapes (Supabase vs. in-memory) with different primary-key formats (`UUID` vs. `BK-${counter}`). Callers sometimes treat IDs as strings, sometimes parse them — any code that trims the prefix will break when Supabase is active. | High | Introduce a `PersistenceAdapter` layer that normalizes shapes to one canonical schema before returning to services. Generate IDs centrally (UUID v4 in both paths). |
| 1.2 | **No module boundaries for tools.** `agent-tools.js` mixes tool schemas *and* handlers in a single ~1,200-line file. A new engineer cannot tell which tools are READ vs. WRITE without grepping. | Medium | Split into `tools/schemas.js`, `tools/read/*.js`, `tools/write/*.js`. Expose a registry with metadata (`{name, category, sideEffects}`). |
| 1.3 | **Hidden global mutable state.** `gemini.service.js` uses module-level flags (`_primaryModelExhausted`) and process-wide caches. On Netlify, Lambdas get recycled unpredictably — behavior is non-deterministic across cold/warm invocations. | High | Move per-request state into a request-scoped context object. Move rate-limit flags into Redis/Supabase with TTL, not process memory. |
| 1.4 | **Arabic text normalization duplicated.** Normalization logic (Tatweel, ZWNJ, diacritics, Arabic-Indic numerals) appears in the classifier, the search helpers, and partially in the webhook. | Low | Extract `utils/arabicNormalize.js` with one `normalize(str)` and one `tokenize(str)`. |
| 1.5 | **No observability.** `logger` prints to stdout only. There is no request ID propagation across classifier → RAG → LLM → tools → DB, so a failed booking can't be traced. | High | Add a `requestId` generated in the webhook layer, include it in every log line and every DB write, and emit structured JSON logs. |
| 1.6 | **Frontend–backend contract drift.** The client normalizes `phoneNumber` vs. `phone_number` and `customer_message` vs. `customerMessage` at call sites. Any new endpoint reintroduces the bug. | Medium | Define one shared schema (Zod/TypeScript types) and enforce camelCase at the API boundary, snake_case only inside Supabase queries. |

---

## 2. Tool Audit

All 13 tools in `agent-tools.js` were reviewed for necessity, required-parameter correctness, timezone handling, and scope. Summary of material issues:

| # | Tool | Finding | Severity | Recommendation |
|---|------|---------|----------|----------------|
| 2.1 | `book_maintenance` | **Required fields = `[service_type, car_make, car_model, preferred_date, branch]` — `preferred_time` is missing** despite the user-specified contract that booking must collect "location, car type, time, day, date." The tool accepts a booking with *no time* and silently defaults to `'9:00 صباحاً'`. | **Critical** | Add `preferred_time` to `required`. Validate against the branch's `TIME_SLOTS`. Fail the tool call (don't default) when time is absent. |
| 2.2 | `book_maintenance` | **Time-format inconsistency.** `TIME_SLOTS` use `'9:00 ص'` / `'10:00 ص'` etc., but the default fallback injects `'9:00 صباحاً'`. A later availability check comparing strings will never match — bookings are silently created at a slot the branch doesn't actually offer. | **Critical** | Canonicalize to one format (e.g., 24-hour `"09:00"`) internally. Display-format only at render time. Reject any time not in the canonical slot enum. |
| 2.3 | `check_branch_availability` | **Timezone bug.** `new Date('2026-04-17').setDate(...)` parses the date as **UTC midnight**, so in Amman (UTC+3) the resulting `dayOfWeek` may be the previous day. A Saturday booking may be flagged as a Friday (closed day) or vice versa. | **Critical** | Parse dates with explicit timezone (Asia/Amman) using `date-fns-tz` or `Temporal`. Never rely on `new Date(YYYY-MM-DD)`. |
| 2.4 | `check_branch_availability` | **Only Friday is treated as closed.** Jordanian dealerships typically close Friday *and* part of Saturday morning; Ramadan hours differ. Hardcoded `dayOfWeek === 5` check is too narrow. | High | Move closed days / hours into branch config in Supabase, per branch, with overrides for holidays/Ramadan. |
| 2.5 | `check_branch_availability` | **No concurrency control.** Two customers booking the same slot from different WhatsApp threads within the same Lambda window can both succeed (read-check-write is not atomic). | High | Wrap booking creation in a Supabase transaction or upsert with a `UNIQUE(branch, date, time)` constraint and handle the conflict error. |
| 2.6 | `search_cars` | **User-controlled `ILIKE` wildcards.** Filters like `make` and `model` are interpolated into `.ilike('%${make}%')` without escaping `%` and `_`. An input of `%` returns the full inventory; `_` matches any character — both a data-exposure and a DoS vector. | High | Escape wildcards: `input.replace(/[%_\\]/g, '\\$&')` and pass with `.ilike` — or switch to `textSearch` with `tsvector`. |
| 2.7 | `calculate_financing` | **No bounds checking.** Accepts any `downPayment`, `term`, `interestRate`. A negative down payment or a 10,000-month term returns a nonsense quote that the LLM will confidently relay. | Medium | Validate ranges (`0 ≤ downPayment ≤ price`, `12 ≤ term ≤ 84`, `0 ≤ rate ≤ 25`). Reject with a descriptive tool error. |
| 2.8 | `compare_cars` | **No limit on list size.** The LLM can pass 20 car IDs; the tool fans out 20 DB queries before prompt budget is considered. | Medium | Enforce `max_items: 4` in schema and at runtime. |
| 2.9 | `submit_support_ticket` | **PII in description field.** No scrubbing of phone/id-card patterns before persistence. Combined with plaintext logs, this is a privacy leak. | Medium | Run a regex-based PII scrub on `description` before storing; store originals in a separate, access-controlled column only if needed. |
| 2.10 | `get_customer_bookings` | **Phone-number format ambiguity.** Lookup uses the raw phone as the key; `+962…` and `962…` are treated as different customers. | High | Normalize phone at the auth/webhook boundary (E.164) and store only the normalized form. |
| 2.11 | Write tools (`book_maintenance`, `create_purchase_inquiry`, `submit_support_ticket`) | **Silent disabling on fallback model.** `_primaryModelExhausted=true` removes these tools from the LLM's toolbelt, so the assistant quietly "forgets" how to book during TPD exhaustion. | **Critical** | Either keep WRITE_TOOLS enabled on the fallback (if it supports tool-calls reliably) or return a degraded-mode response to the user ("I'll have an agent call you back — logged ticket #…"). Never let the user think the bot is still able to book. |
| 2.12 | All tools | **No tool-level timeouts.** `agent-tools.js` dispatches DB queries without per-call deadlines; a stalled Supabase query can eat the whole 20 s webhook budget. | High | Wrap every handler in `Promise.race` with a 3-5 s deadline. |
| 2.13 | All tools | **No structured error contract.** Handlers return freeform strings; the LLM sometimes treats a `"failed"` string as success. | Medium | Return `{ok: boolean, data, errorCode, userMessage}` and train the LLM (via system prompt + few-shot) to branch on `ok`. |

**Tools judged necessary and well-scoped:** `get_promotions`, `get_branch_info`, `get_service_types`, `check_parts_inventory`. These are READ-only, side-effect-free, and their schemas match their contract.

---

## 3. Pipeline Design & Analysis

### 3.1 Current pipeline (observed)

```
WhatsApp webhook
   │
   ▼
Signature check   ← MISSING today
   │
   ▼
Dedup (in-memory Set, lost on cold start)
   │
   ▼
Arabic normalize + classifier.js
   │  (canned short-circuit on greetings/FAQ)
   │
   ▼
Load conversation state (Supabase)
   │
   ▼
RAG retrieve (≤1.5 s timeout, capped ~800 tokens)
   │
   ▼
LLM1 (Groq llama-3.3-70b) — tool selection
   │
   ▼
Tool dispatch (up to 3) → tool cache
   │
   ▼
LLM2 — response formatting (budget = min(7000, 15000-elapsed))
   │
   ▼
Persist conversation state
   │
   ▼
Send WhatsApp reply
```

### 3.2 Gaps in the current design

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 3.1 | **Synchronous 20 s webhook path.** Meta expects a 200 within 20 s, but the AI stage alone is budgeted at 16 s plus send/save overhead. On warm misses or Groq slowdowns the webhook returns 504 and Meta retries, producing duplicate replies. | **Critical** | Acknowledge the webhook immediately (200 OK) and enqueue work to a background function (Netlify Background Function or a queue). Dedup via persistent store. |
| 3.2 | **In-memory `seenMessageIds`** is lost across cold starts, so dedup is best-effort only. | High | Use a Supabase table (`webhook_events`) with a uniqueness constraint on `message_id`. Insert on receipt; ignore duplicate-key errors. |
| 3.3 | **Tool dispatch cap of 3 with no replan.** If the classifier picks the wrong intent, the LLM burns 3 tool calls and then hits the cap without producing a useful answer. | High | Allow up to 5 calls but enforce a per-category budget (≤2 READ, ≤1 WRITE), and add a "no tool called" recovery arm that asks one clarifying question. |
| 3.4 | **No circuit breaker on Groq.** Repeated 5xx from Groq still consume the full retry budget. | Medium | Add a cheap circuit breaker (5 failures in 60 s → open for 30 s) that returns a pre-written Arabic "fallback" reply and logs a ticket. |
| 3.5 | **RAG retrieval is keyword-only.** No semantic fallback when the customer paraphrases ("عندك شي اقتصادي تحت 10 آلاف؟" may not match `budget`). | Medium | Add a second retrieval arm using pgvector embeddings for `cars` and `promotions`; merge with keyword results. |
| 3.6 | **No validation stage between tool result and LLM2.** If a tool returns malformed JSON (e.g., Supabase type mismatch) it is passed straight to the LLM, which hallucinates. | High | Insert a `validateToolResult(schema, payload)` step (Zod) between dispatch and LLM2. On failure, surface a structured tool error. |

### 3.3 Proposed optimal pipeline

```
WhatsApp webhook
   │  (HMAC verify, 200 OK immediate)
   ▼
Persistent dedup (Supabase)
   │
   ▼
Enqueue job (background function)
   ▼
  Worker
   │
   ▼ Arabic normalize + classifier
   │   ├─ canned short-circuit
   │   └─ intent + entities + confidence
   │
   ▼ Load conversation state (+ request-scoped context)
   │
   ▼ RAG: keyword + pgvector hybrid (≤1.5 s)
   │
   ▼ LLM1 tool selection (with circuit breaker)
   │
   ▼ Tool dispatch w/ per-tool timeouts + schema validation
   │
   ▼ LLM2 response (token budget based on remaining time)
   │
   ▼ Persist state + structured audit log (requestId)
   │
   ▼ Send WhatsApp reply via Meta Graph w/ retry-on-429
```

---

## 4. AI Component Review

### 4.1 Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 4.1 | **Persona prompt is a monolithic Arabic block.** The system prompt mixes persona, rules, tool catalogue hints, and edge-case handling. Hard to test in isolation; small edits drift behavior. | High | Split into sections (persona, rules, tools, output format) and compose at runtime. Add a prompt version string logged with every request. |
| 4.2 | **`maxHistory=8` truncates context mid-booking.** A multi-turn booking (collect service → car → date → time → branch) can easily exceed 4 turns once clarifications are added; the earliest fields drop out. | High | Persist `collected_entities` in `conversation_states` (already implemented) and **inject entities explicitly** into the system prompt rather than relying on raw history. |
| 4.3 | **RAG context cap at ~300 chars when injected** squeezes out relevant rows. Five-row inventory responses often exceed 300 chars. | High | Raise to ~1,500 chars (≈600 Arabic words) for car-intent requests; keep 300 for greetings. Budget per intent, not globally. |
| 4.4 | **No source grounding.** The LLM can hallucinate a car that wasn't in retrieval. There is no post-LLM check that every car make/model/price mentioned in the reply actually appears in the retrieved context. | High | Add a light post-LLM validator that scans the reply for model/price tokens not present in retrieved data, and either strips them or re-prompts. |
| 4.5 | **No agentic replan.** If the LLM's first tool call returns nothing, there's no meta-step that considers "should I ask the user first?" vs. "try a different tool." | Medium | Add an implicit replanner: after each tool result, include a short "observation" in the history and let LLM1 decide the next action. |
| 4.6 | **Classifier uses substring matching for Arabic makes/models.** E.g., `"كيا"` matches `"مكيا"` (meaningless fragment). False-positive intents are expensive. | High | Use word-boundary regex `(^|\\s)كيا(\\s|$)` on the normalized string, plus a small blocklist of known collisions. |
| 4.7 | **`isNegated()` is shallow.** Does not handle discontinuous negation ("ما بدّي … بس أفضّل") common in Jordanian dialect. | Medium | Add negation window of ±3 tokens and a list of affirmative counterparts ("أفضّل", "بدّي", "محتاج") to override. |
| 4.8 | **Tool descriptions are too terse.** LLM1 has to guess when to use `search_cars` vs. `compare_cars`. | Medium | Add explicit "Use when / Don't use when" examples in each tool description — this materially improves Groq tool selection. |
| 4.9 | **No evaluation harness.** There is no golden-set test of "user message → expected intent → expected tool calls → expected reply contains X." Every change risks silent regressions. | High | Add `tests/golden/` with 40–60 Arabic conversation fixtures and run them in CI against the real models or a recorded-cassette fixture. |
| 4.10 | **Edge case — mixed Arabic/English digits.** Classifier normalizes Arabic-Indic digits but tool handlers sometimes expect the raw input. A user typing `٢٠٢٠` may end up with `year=2020` in the classifier and `year="٢٠٢٠"` in the tool, failing the DB query. | Medium | Normalize at the *edge* (once) and propagate only the normalized form internally. |
| 4.11 | **Edge case — code-mix ("أبي Camry 2020").** Works in many cases but classifier regexes are Arabic-first; English makes sometimes miss. | Low | Add a parallel English-make lookup table and union results. |
| 4.12 | **No PII / jailbreak guardrail.** Nothing prevents the model from echoing a stored customer's phone number to a different number that impersonates them. | High | Before LLM2 emits a reply, scan retrieved context for PII and redact anything not belonging to the current `phone_number`. |

---

## 5. Backend Security & Bug Analysis

### 5.1 Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 5.1 | **Meta webhook HMAC not verified.** `webhook.routes.js` does not check the `X-Hub-Signature-256` header. Any attacker who knows the webhook URL can inject fake WhatsApp messages — booking fraud, spam, defamation in the customer transcripts table. | **Critical** | Verify HMAC-SHA256 with `APP_SECRET` on every POST. Reject on mismatch. Make the raw body available (Express `express.raw`) for correct signature calculation. |
| 5.2 | **Plaintext password comparison in `middleware/auth.js`.** `USERS.find(u => u.username === username && u.password === password)`. A leaked env dump exposes admin creds directly. | **Critical** | Store `bcrypt` hashes. Use `bcrypt.compare` with constant-time behavior. Rotate existing creds after migration. |
| 5.3 | **JWT secret fallback string.** If `JWT_SECRET` is unset, the code falls back to `'dev_only_insecure_secret_please_change_in_env_file_32chars'`. On a misconfigured deploy, tokens are trivially forgeable. | **Critical** | Refuse to start the server when `JWT_SECRET` is missing or shorter than 32 chars. |
| 5.4 | **JWT blacklist is an in-memory `Set`.** On Netlify each Lambda invocation may start fresh — logout doesn't actually revoke tokens cluster-wide. | High | Use short-lived access tokens (15 min) + refresh tokens persisted in Supabase with revocation column. |
| 5.5 | **No parameterized rate limiting per WhatsApp phone.** The rate limiter is IP-based; WhatsApp webhook traffic all comes from Meta's IPs, so one abusive customer isn't throttled. | High | Add an application-layer rate limiter keyed by `phone_number` inside the webhook handler. |
| 5.6 | **Supabase `.ilike` and `.or` with user input** (see 2.6). Same pattern appears in `searchCars`, `searchParts`, `searchCustomers`. | High | Escape `%`, `_`, `\` before interpolation. For `.or()`, prefer a typed RPC with positional parameters. |
| 5.7 | **Race condition in `updateCustomerLoyalty`.** Read-modify-write with no optimistic locking; concurrent bookings double-increment or drop points. | High | Replace with a Supabase RPC that performs `UPDATE customers SET points = points + $1 WHERE id = $2 RETURNING points;`. |
| 5.8 | **Phone-number key not normalized** (see 2.10). `getCustomer` compares raw strings. | High | Normalize once at webhook entry; store only E.164. |
| 5.9 | **`/debug-env` exists.** Even though gated on `NODE_ENV !== 'production'`, misconfigured preview deploys can expose env names/lengths. | Medium | Remove in favor of a `healthz` endpoint that reveals nothing sensitive. |
| 5.10 | **Error handler returns stack traces when `NODE_ENV !== 'production'`.** Netlify preview deploys sometimes run with `development` mode, leaking paths and versions. | Medium | Gate on an explicit `DEBUG_ERRORS=true` flag rather than `NODE_ENV`. |
| 5.11 | **CORS allows "no origin" requests.** Same-domain calls pass, but so do many server-to-server tools (curl, Postman). | Low | Allow no-origin only on the webhook route; enforce a strict allowlist elsewhere. |
| 5.12 | **No SQL-level row-level security (RLS) notes.** Unclear whether Supabase RLS is enabled on `bookings`, `customers`, `conversation_states`. If not, a leaked anon key grants full read/write. | **Critical** | Enable RLS on every public table. Use `service_role` key only server-side; ensure it is not shipped to the client. |
| 5.13 | **No audit log.** Bookings, purchase inquiries, and support tickets are mutated without an append-only history, so tampering is undetectable. | High | Add `audit_log(action, entity, entity_id, actor, before, after, ts)` insert on every write. |
| 5.14 | **Silent failure of Supabase fallback.** When Supabase is down, writes go to in-memory and are lost on Lambda recycle. Customers see "booking confirmed" but no record exists. | **Critical** | On Supabase failure for WRITE tools, return a graceful error to the user ("سجلنا طلبك وبنرجعلك بأقرب وقت") and enqueue a retry; do **not** pretend the write succeeded. |
| 5.15 | **`createdAt` derived from client or Lambda clock.** Time zone drift makes reports inconsistent. | Medium | Use Supabase `now()` as `DEFAULT` and stop sending timestamps from the app. |
| 5.16 | **No input length caps on free-text fields.** `description`, `customer_message`, booking notes accept arbitrary-length strings — a malicious client can balloon Supabase rows. | Medium | Enforce server-side maxima (e.g., 2 KB) and 413 on overflow. |

---

## 6. Frontend Bug Review

### 6.1 Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 6.1 | **JWT in `localStorage`** (`AuthContext.jsx`). Any XSS exfiltrates the admin session. | **Critical** | Move to an `HttpOnly; Secure; SameSite=Lax` cookie issued by the backend; keep CSRF protection via double-submit token. |
| 6.2 | **Global `axios.defaults.headers.common.Authorization`.** Any third-party axios call (e.g., a future analytics snippet) leaks the JWT off-domain. | High | Use a dedicated axios instance (`api.create({...})`) and only attach `Authorization` on that instance. |
| 6.3 | **Polling every 10 s in `Conversations.jsx` regardless of tab visibility.** Drains device battery and wastes Supabase egress. | Medium | Gate polling on `document.visibilityState === 'visible'`; switch to Supabase Realtime channel or server-sent events where available. |
| 6.4 | **AudioContext created per poll on new messages.** Browsers throttle after ~20 contexts and Safari warns. | Medium | Create a single AudioContext once in a ref; resume on first user gesture. |
| 6.5 | **`alert()` used for errors** in `Bookings.jsx` and `Conversations.jsx`. Blocks the UI, breaks keyboard flow, and hides the context. | Medium | Replace with a toast/snackbar component; log the raw error to console for debugging. |
| 6.6 | **`toLocaleString('ar-SA')` hardcoded** in `Bookings.jsx`. Saudi Hijri calendar rendering for a Jordanian dealer is a UX bug. | Medium | Use `ar-JO` for locale *and* an explicit Gregorian `calendar: 'gregory'` option; factor into a single `formatDate()` helper. |
| 6.7 | **Frontend ↔ backend field-name drift** (see 1.6). Client does ad-hoc normalization for `phoneNumber`/`phone_number` and `customer_message`/`customerMessage`. | Medium | Fix at the server boundary: always camelCase in API responses. |
| 6.8 | **No input validation on booking form.** Date/time can be past values; phone can be non-numeric; fields can be empty. | High | Zod schema on submit; disable the submit button until valid; reject past dates; enforce Jordanian phone pattern. |
| 6.9 | **No optimistic-UI rollback.** A booking status change shows success before the server confirms; on 500 the UI is stale. | Medium | Use React Query / SWR with `onMutate` → `onError` rollback; or revalidate from server after mutation. |
| 6.10 | **Error boundary missing at the route level.** A single render error in a child component blanks the whole admin app. | Medium | Wrap route outlet in an error boundary with a "reload" action. |
| 6.11 | **No CSRF protection** on admin mutation endpoints (because auth is via `Authorization` header, CSRF is limited — but becomes live when migrating to cookies per 6.1). | High (after 6.1) | Implement double-submit token alongside the HttpOnly cookie migration. |
| 6.12 | **No i18n scaffolding.** Arabic strings are hardcoded in JSX. Any future English admin view will require a rewrite. | Low | Introduce `react-i18next` now; default to `ar`. |
| 6.13 | **No automated a11y checks.** RTL mixing with LTR numerals and icon-only buttons have no aria-labels. | Medium | Add `@axe-core/react` in dev and fix at least the critical violations before release. |

---

## 7. Priority Action List

Addressed in descending order of impact on stability, correctness, and safety.

1. **Verify Meta webhook HMAC signatures.** Until this ships, any third party can forge customer messages and trigger bookings. *(5.1)*
2. **Fix `book_maintenance` required fields and time-format mismatch.** Add `preferred_time` to `required` and canonicalize slot strings. Without this, confirmed bookings are being created at time slots the branch does not offer. *(2.1, 2.2)*
3. **Replace silent write-tool disabling on fallback with a user-visible degraded mode.** Right now the system tells customers it will book and then doesn't. *(2.11)*
4. **Fix the `check_branch_availability` timezone bug and expand closed-day logic.** Parse dates in Asia/Amman; push closed days/hours into branch config. *(2.3, 2.4)*
5. **Make the webhook ack-then-process.** Return 200 OK immediately; run the AI pipeline in a background function with persistent dedup. Eliminates Meta retries / duplicate replies. *(3.1, 3.2)*
6. **Migrate to bcrypt passwords and fail-fast on missing `JWT_SECRET`.** Also move JWT out of `localStorage` into an HttpOnly cookie. *(5.2, 5.3, 6.1)*
7. **Enable Supabase RLS on every public table and audit the anon key surface.** *(5.12)*
8. **Never silently accept a write during Supabase outage.** Surface a graceful fallback message and enqueue retry. *(5.14)*
9. **Escape `%`/`_`/`\` before any `.ilike` with user input** and add per-tool timeouts + structured error contracts. *(2.6, 2.12, 2.13, 5.6)*
10. **Normalize phone numbers to E.164 at the webhook edge** and stop comparing raw strings. *(2.10, 5.8)*
11. **Persist conversation entities (already present) but inject them explicitly into the system prompt**, and lift the 300-char RAG injection cap for car intents. *(4.2, 4.3)*
12. **Add source-grounding post-check** to strip hallucinated car/price tokens from LLM2 output. *(4.4)*
13. **Introduce a golden-set evaluation harness in CI** covering Arabic booking, price, parts, and ambiguous intents. *(4.9)*
14. **Add observability**: requestId propagation, structured logs, Supabase audit_log, circuit breaker on Groq. *(1.5, 3.4, 5.13)*
15. **Frontend polish**: replace `alert()`, gate polling on tab visibility, fix `ar-SA` locale to `ar-JO`, add input validation and an error boundary. *(6.3–6.10)*

---

**Overall verdict:** The architecture is sensible and the pre-LLM classifier + RAG injection is a solid latency strategy. The system is close to production-ready for read-only queries (promotions, parts, branch info), but it is **not safe for write flows** in its current state. The booking path in particular has compounding failures — missing required time field, time-format mismatch, timezone bug in availability, no concurrency control, silent disabling on fallback, and no graceful degradation during Supabase outage — any one of which can produce a "confirmed but ghost" booking. Items 1–8 in the Priority Action List should block further rollout.
