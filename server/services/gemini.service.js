/**
 * أوتو جوردن - AI Service (Speed-Optimised)
 * Groq llama-3.1-8b-instant with parallel tool execution
 */

const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { TOOL_DEFINITIONS, executeTool } = require('./agent-tools');
const db = require('../database/db');
const { classify } = require('./classifier');
const { retrieveContext } = require('./rag.service');

// =============================================
// System Prompt — مختصر ومركّز للسرعة
// =============================================
const SYSTEM_PROMPT = `أنت "أبو الزوز" 🚗 مساعد أوتو جوردن للسيارات — بلهجة أردنية ودية مختصرة.

**ممنوع:** تخمين أسعار، تأكيد حجز بدون booking_id، استدعاء أداة قبل جمع متطلباتها. **سؤال واحد فقط في كل رسالة.**

⚡ **قاعدة الأداء:** إذا وُجدت **بيانات من المخزون** أو **قطع غيار متوفرة** في السياق أدناه، اعتمد عليها مباشرةً — **لا تستدعِ search_cars أو check_parts_inventory مجدداً.** استدعِ الأداة فقط إذا لم تجد البيانات في السياق.

## 📋 حجز الصيانة — 7 خطوات مرتبة:
1. نوع الخدمة → اسأل إذا ما ذكره
2. ماركة وموديل السيارة → اسأل إذا ما ذكرهم
3. التاريخ → اسأل. حوّل أي تاريخ طبيعي (بكرا/الاثنين/15-4) إلى YYYY-MM-DD قبل الاستدعاء
4. الفرع (عمان/إربد/الزرقاء/العقبة) → اسأل إذا ما ذكره
5. استدعِ check_branch_availability(branch, date)
   - is_available=false → أخبره الفرع مليء واقترح suggested_dates، اسأل عن تاريخ بديل
   - is_available=true → انتقل لخطوة 6
6. استدعِ book_maintenance بكل الحقول الخمسة
   - needs_more_info=true → اسأل عن الحقل الناقص
7. بعد booking_id → أكّد التفاصيل للعميل وأخبره بنتصل عليه

## 🚗 شراء سيارة:
1. إذا وُجدت **بيانات من المخزون** في السياق → اعرضها مباشرة ولا تستدعِ search_cars. إذا لم توجد → استدعِ search_cars بالمواصفات المتوفرة (ماركة/ميزانية/نوع وقود/حالة...).
2. اعرض النتائج للعميل
3. إذا لم تُوجَد سيارات: أخبره ما في بهالمواصفات الآن، اقترح بدائل أو سجّل اهتمامه
4. إذا أبدى اهتماماً جدياً → استدعِ create_purchase_inquiry (اسأل: تقسيط؟ عنده سيارة للبدل؟)

## 💰 تقسيط:
قبل calculate_financing اجمع: سعر السيارة + الدفعة الأولى + المدة. إذا ما ذكر الدفعة اسأله، إذا ما ذكر المدة افترض 36 شهراً.

## 🔧 قطع الغيار:
إذا ما ذكر العميل اسم القطعة → اسأله أولاً. ثم استدعِ check_parts_inventory(name, car_make?, car_model?).

## 🔁 إلغاء/تعديل حجز أو شكوى:
→ استدعِ submit_support_ticket(issue_description, category='booking_change'|'complaint') وأخبره بيتصل فيه موظف.

## 📌 أدوات سريعة:
- "هل عندكم X؟" أو "كم واحدة عندكم؟" → check_availability(make, model)
- "قارن X وY" → compare_cars (استنتج الماركة إذا ذكر الموديل فقط)
- مواعيدي السابقة → get_customer_bookings
- عروض وتخفيضات → get_promotions
- معلومات فرع → get_branch_info
- يطلب موظف/شكوى → submit_support_ticket

## ردودك:
- مختصرة، بدون مقدمات. إيموجي خفيف (🚗 🔧 ✅ 💰)
- خطأ تقني → "واجهنا مشكلة بسيطة، اتصل 06-5000001"

## معلومات أوتو جوردن:
- 06-5000001 | عمان، شارع المدينة المنورة
- 4 أفرع: عمان، إربد، الزرقاء، العقبة
- ساعات: أسبوع 8ص-8م | جمعة 8ص-2م | سبت 8ص-6م
- ماركات: Toyota, Hyundai, Kia, MG, Chery, Nissan, BMW
- دفع: كاش، بطاقة، تحويل، تقسيط حتى 60 شهر`;

// =============================================
// AI Service Class
// =============================================
class GeminiService {
    constructor() {
        this.client = null;
        this.conversationHistory = new Map();
        this.conversationLastAccess = new Map();
        // Primary model: Qwen3-32B on Groq — reasoning-capable + full tool use.
        // We switched to Qwen3 for better agentic reasoning on complex Arabic
        // purchase / booking queries; the old llama-3.1-8b-instant produced
        // fewer correct tool plans on multi-step flows. Background Functions
        // give us unlimited time so reasoning latency is no longer a blocker.
        //
        // Fallback model: llama-3.3-70b-versatile — used when Qwen hits TPD
        // (tokens-per-day) limit or emits a connection error. No reasoning on
        // the fallback, but strong tool use.
        this.model         = process.env.GROQ_MODEL          || 'qwen/qwen3-32b';
        this.fallbackModel = process.env.GROQ_FALLBACK_MODEL || 'llama-3.3-70b-versatile';
        // Track whether primary model's daily quota is exhausted this serverless instance.
        // Groq TPD resets at UTC midnight. We also record the UTC date we hit it so a
        // long-running process gives the primary model another chance the next day.
        this._primaryModelExhausted = false;
        this._exhaustedUtcDate = null; // 'YYYY-MM-DD' of when we hit TPD
        this.maxHistory = 8;     // Last 4 turns — smaller = fewer tokens = faster
        this.maxToolCalls = 3;   // Hard cap on tool round-trips
        this.MAX_CUSTOMERS = parseInt(process.env.MAX_CONVERSATION_CUSTOMERS) || 10000;
        this.CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
        this._initialize();
        this._startCleanupTimer();
    }

    _startCleanupTimer() {
        if (process.env.NETLIFY) return; // No persistent process in serverless
        this._cleanupInterval = setInterval(() => this._cleanupStale(), 60 * 60 * 1000);
        if (this._cleanupInterval.unref) this._cleanupInterval.unref();
    }

    _cleanupStale() {
        const now = Date.now();
        let removed = 0;
        for (const [phone, lastAccess] of this.conversationLastAccess.entries()) {
            if (now - lastAccess > this.CONVERSATION_TTL_MS) {
                this.conversationHistory.delete(phone);
                this.conversationLastAccess.delete(phone);
                removed++;
            }
        }
        if (removed > 0) logger.info(`🧹 تم تنظيف ${removed} محادثة قديمة`);
    }

    _evictOldestIfFull() {
        while (this.conversationHistory.size >= this.MAX_CUSTOMERS) {
            const oldest = this.conversationHistory.keys().next().value;
            if (oldest === undefined) break;
            this.conversationHistory.delete(oldest);
            this.conversationLastAccess.delete(oldest);
        }
    }

    _initialize() {
        try {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) {
                logger.warn('⚠️ GROQ_API_KEY غير موجود - سيتم استخدام ردود افتراضية');
                return;
            }
            this.client = new Groq({ apiKey });
            logger.success(`✅ Groq AI جاهز — Model: ${this.model}`);
        } catch (error) {
            logger.error('❌ خطأ في تهيئة Groq AI:', error);
        }
    }

    /** UTC date helper used by the TPD-reset logic. */
    _currentUtcDate() {
        return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    }

    /**
     * Detect reasoning-capable Groq models — Qwen3 / QwQ / DeepSeek-R1 / o1-*.
     * Groq rejects `reasoning_effort` / `reasoning_format` on non-reasoning
     * models, so we only inject those params when we know the server accepts
     * them. Detection is conservative: match by prefix/substring so new
     * variants (`qwen/qwen3-72b`, etc.) get picked up automatically.
     */
    _isReasoningModel(model) {
        if (!model) return false;
        const m = String(model).toLowerCase();
        return (
            m.includes('qwen3')           // qwen/qwen3-32b and future sizes
            || m.includes('qwq')          // qwen-qwq-32b
            || m.startsWith('o1-')         // OpenAI-style reasoning
            || m.includes('deepseek-r1')   // DeepSeek R1
            || m.includes('reasoning')     // generic marker
        );
    }

    /**
     * Build the reasoning-specific fields for the Groq request. Returns an
     * empty object for non-reasoning models so it's safe to spread
     * unconditionally.
     *
     *   reasoning_effort: 'default' → model uses its chain-of-thought
     *   reasoning_format: 'hidden'  → CoT stripped from assistant output
     *                                  (we never want <think>...</think> to
     *                                  leak to a WhatsApp customer)
     */
    _reasoningParamsFor(model) {
        if (!this._isReasoningModel(model)) return {};
        return {
            reasoning_effort: process.env.GROQ_REASONING_EFFORT || 'default',
            reasoning_format: 'hidden',
        };
    }

    /**
     * If the UTC day has rolled over since we hit TPD, clear the exhausted flag
     * so the next call gets routed back to the primary model. Groq's TPD window
     * is a rolling UTC day, so this is a safe heuristic — worst case we get one
     * extra 429 and we set the flag again.
     */
    _maybeResetTpdFlag() {
        if (!this._primaryModelExhausted) return;
        const today = this._currentUtcDate();
        if (this._exhaustedUtcDate && this._exhaustedUtcDate !== today) {
            logger.info(`🔄 UTC day rolled over — resetting TPD flag, re-trying primary model (${this.model})`);
            this._primaryModelExhausted = false;
            this._exhaustedUtcDate = null;
        }
    }

    /**
     * Health-check shim: returns a snapshot of the service's readiness
     * without performing any network I/O. Safe to call from /ready on
     * every request. See routes/admin.routes.js.
     */
    getHealthStatus() {
        return {
            configured:           !!this.client,
            model:                this.model,
            fallback_model:       this.fallbackModel,
            primary_exhausted:    !!this._primaryModelExhausted,
            exhausted_utc_date:   this._exhaustedUtcDate || null,
        };
    }

    /**
     * Low-level Groq API call with:
     * - AbortSignal support (pass the generateResponse-level controller)
     * - Automatic model fallback on TPD exhaustion (tokens-per-day quota)
     * - Retry once on transient TPM (tokens-per-minute) rate limits (wait ≤3s)
     * - Retry once on connection errors
     *
     * TPD vs TPM detection:
     *   Groq error messages say "tokens per day (TPD)" for daily quota and
     *   "tokens per minute" for per-minute bursts. TPD waits are measured in
     *   minutes/hours → we switch models instead of waiting.
     */
    async _callGroq(params, signal) {
        // Give the primary model another chance once the UTC day has rolled over.
        this._maybeResetTpdFlag();

        // If primary model's daily quota was already exhausted this instance,
        // skip straight to fallback without a wasted round-trip.
        const effectiveParams = (this._primaryModelExhausted && params.model === this.model)
            ? { ...params, model: this.fallbackModel }
            : params;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await this.client.chat.completions.create(effectiveParams, { signal });
            } catch (err) {
                // AbortError → outer timeout fired, stop immediately
                if (err?.name === 'AbortError' || signal?.aborted) throw err;

                const status = err?.status || err?.statusCode;
                const msg    = err?.message || '';

                if (status === 429 && attempt < 2) {
                    const isTPD = /tokens per day/i.test(msg);

                    if (isTPD) {
                        // Daily quota exhausted — waiting is futile (42+ min).
                        // Switch to fallback model for the rest of the UTC day.
                        this._primaryModelExhausted = true;
                        this._exhaustedUtcDate = this._currentUtcDate();
                        logger.warn(`⚠️ Groq TPD exhausted for ${effectiveParams.model} — switching to fallback: ${this.fallbackModel} until UTC ${this._exhaustedUtcDate} rolls over`);
                        effectiveParams.model = this.fallbackModel;
                        // Retry immediately with new model (no sleep needed)
                        continue;
                    }

                    // Transient TPM burst — wait briefly then retry same model
                    const waitMs = Math.min(this._parseRetryAfterMs(msg), 3000);
                    logger.warn(`⚠️ Groq TPM rate limit (429) — waiting ${waitMs}ms before retry`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                // Connection error — retry once immediately
                if ((msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('network')) && attempt < 2) {
                    logger.warn(`⚠️ Groq connection error — retrying immediately`);
                    continue;
                }

                throw err;
            }
        }
    }

    /** Extract retry-after seconds from Groq 429 error message */
    _parseRetryAfterMs(message = '') {
        // "try again in 2.5s" — TPM burst format
        const secs = message.match(/try again in (\d+(?:\.\d+)?)s/);
        if (secs) return Math.ceil(parseFloat(secs[1])) * 1000;
        // "try again in 1m30s" — sometimes seen for longer waits
        const mins = message.match(/try again in (\d+)m(\d+)s/);
        if (mins) return (parseInt(mins[1]) * 60 + parseInt(mins[2])) * 1000;
        return 2000;
    }

    /**
     * When LLM2 (response generation after tool call) times out or fails,
     * format the tool result directly into Arabic so the user isn't left
     * with a generic fallback message even though the action succeeded.
     */
    _formatToolFallback(toolName, toolResult) {
        try {
            const r = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
            switch (toolName) {
                case 'check_branch_availability': {
                    if (r.is_available === false) {
                        const alts = (r.suggested_dates || []).join('، ') || 'تواريخ قريبة';
                        return `عذراً، فرع ${r.branch || ''} محجوز بالكامل بتاريخ ${r.date || ''}.\n📅 تواريخ بديلة مقترحة: ${alts}\nأي تاريخ يناسبك؟`;
                    }
                    if (r.is_available === true) {
                        const slots = (r.available_time_slots || []).slice(0, 4).join('، ');
                        return `✅ فرع ${r.branch || ''} متوفر بتاريخ ${r.date || ''}!\nأوقات متاحة: ${slots}\nأي وقت يناسبك؟`;
                    }
                    return null;
                }
                case 'book_maintenance': {
                    if (r.booking_id || (r.details && r.details.booking_id)) {
                        const id = r.booking_id || r.details?.booking_id;
                        const branch = r.details?.branch || '';
                        const date = r.details?.date || '';
                        const car = r.details?.car || '';
                        return `✅ تم حجز موعد الصيانة بنجاح!\n📋 رقم الحجز: ${id}\n🏢 الفرع: ${branch}\n📅 التاريخ: ${date}\n🚗 السيارة: ${car}\n\nسنتواصل معك للتأكيد. للاستفسار: 06-5000001`;
                    }
                    if (r.needs_more_info) {
                        const fields = (r.missing_fields || []).join('، ');
                        return `بحتاج منك معلومات إضافية: ${fields} 🙏`;
                    }
                    return `تم استلام طلب الحجز ✅\nسنتواصل معك على رقمك للتأكيد.\nأو اتصل: 06-5000001`;
                }
                case 'submit_support_ticket': {
                    const id = r.ticket_id || r.id;
                    return `✅ تم فتح تذكرة دعم${id ? ` رقم ${id}` : ''}!\nسيتواصل معك فريقنا قريباً 📱`;
                }
                case 'create_purchase_inquiry': {
                    const id = r.inquiry_id || r.id;
                    return `✅ تم تسجيل اهتمامك${id ? ` (رقم ${id})` : ''}!\nسيتصل بك أحد مستشارينا خلال 24 ساعة 🚗`;
                }
                case 'search_cars': {
                    const cars = Array.isArray(r) ? r : (r.cars || r.results || []);
                    if (!cars.length) return 'ما لقيتش سيارات بهالمواصفات 😔\nجرب فلتر ثاني أو اتصل: 06-5000001';
                    const first = cars[0];
                    const price = first.price ? ` — ${Number(first.price).toLocaleString()} دينار` : '';
                    return `وجدت ${cars.length} سيارة! مثال:\n🚗 ${first.make} ${first.model} ${first.year || ''}${price}\n\nللمزيد من الخيارات اتصل: 06-5000001`;
                }
                case 'check_parts_inventory': {
                    if (r.found || r.available) return `✅ القطعة متوفرة — ${r.name || ''} بسعر ${r.price || '?'} دينار`;
                    return `عذراً، هذه القطعة غير متوفرة حالياً.\nاتصل 06-5000001 للاستيراد 🔩`;
                }
                case 'get_branch_info': {
                    // Whether it's a specific branch or all branches, show what we have
                    const branches = Array.isArray(r) ? r : (r.branches || null);
                    if (branches && branches.length) {
                        const lines = branches.map((b, i) =>
                            `${['1️⃣','2️⃣','3️⃣','4️⃣'][i] || '•'} ${b.name || b.city || ''} — ${b.address || ''}`
                        ).join('\n');
                        return `📍 أفرعنا:\n${lines}\n\nتلفون: 06-5000001`;
                    }
                    // Single branch object or unknown structure
                    const name = r.name || r.city || r.branch || '';
                    const addr = r.address || '';
                    if (name || addr) return `📍 ${name}${addr ? ` — ${addr}` : ''}\nتلفون: 06-5000001`;
                    return `عنا 4 أفرع 📍\n1️⃣ عمان - شارع المدينة المنورة\n2️⃣ إربد - شارع الجامعة\n3️⃣ الزرقاء - شارع الأمير محمد\n4️⃣ العقبة - شارع الملك الحسين\n\nتلفون: 06-5000001`;
                }
                case 'get_promotions': {
                    const promos = Array.isArray(r) ? r : (r.promotions || r.offers || []);
                    if (!promos.length) return `ما في عروض خاصة هلق 😊\nبس عنا تقسيط حتى 60 شهر دايماً!\nاتصل: 06-5000001`;
                    const lines = promos.slice(0, 3).map(p => `• ${p.title || p.name || p.description || p}`).join('\n');
                    return `🎉 عروضنا الحالية:\n${lines}\n\nللمزيد: 06-5000001`;
                }
                case 'get_customer_bookings': {
                    const bookings = Array.isArray(r) ? r : (r.bookings || []);
                    if (!bookings.length) return `ما عندك حجوزات نشطة حالياً 📋\nبدك تحجز موعد صيانة جديد؟`;
                    const lines = bookings.slice(0, 3).map(b =>
                        `• ${b.service_type || 'صيانة'} | ${b.preferred_date || ''} | ${b.branch || ''} | الحالة: ${b.status || ''}`
                    ).join('\n');
                    return `📋 حجوزاتك:\n${lines}`;
                }
                default:
                    return null; // no template for this tool — let outer fallback handle it
            }
        } catch {
            return null;
        }
    }

    async generateResponse(phoneNumber, userMessage, customerName, options = {}) {
        const startTime = Date.now();

        // ── Unlimited mode ──────────────────────────────────────
        // When invoked from a Netlify Background Function (15-min cap) we lift
        // the short synchronous-path budgets entirely. Background Functions can
        // run up to 15 minutes, which is effectively unlimited for a single
        // customer message. We still enforce a safety ceiling of 10 minutes so
        // a genuine Groq hang doesn't camp on the execution indefinitely.
        //
        // When called from the legacy sync path (still used for local dev, for
        // the debug /chat endpoint, etc.) we keep the 22s global budget so the
        // sync handler doesn't exceed Netlify Pro's 26s limit.
        const unlimited = !!options.unlimited;
        const GLOBAL_BUDGET_MS = unlimited ? 600000 : 22000; // 10 min vs 22 s
        const abortController = new AbortController();
        const abortTimer = setTimeout(() => {
            logger.warn(`⏱️ generateResponse: ${GLOBAL_BUDGET_MS}ms global budget exhausted — aborting Groq request`);
            abortController.abort();
        }, GLOBAL_BUDGET_MS);

        try {
            // ── 0. Fast Intent Classifier (<1ms) ────────────────────
            const classification = classify(userMessage);
            logger.info(`🏷️ Classifier: intent=${classification.intent} conf=${classification.confidence} entities=${JSON.stringify(classification.entities)}`);

            // ── 1. PARALLEL: Load conv state + RAG pre-fetch ────────
            // These are independent DB calls — run together to save ~1-2s.
            const [convStateResult, ragResult] = await Promise.allSettled([
                db.getConversationState(phoneNumber),
                // Only run RAG if we'll need LLM (skip for canned responses)
                classification.cannedResponse
                    ? Promise.resolve(null)
                    : retrieveContext(classification.intent, classification.entities, {}),
            ]);

            let history = [];
            let convState = null;
            if (convStateResult.status === 'fulfilled' && convStateResult.value) {
                convState = convStateResult.value;
                if (convState.history && Array.isArray(convState.history)) {
                    history = convState.history.slice();
                }
            } else if (convStateResult.status === 'rejected') {
                logger.warn(`⚠️ getConversationState failed (using empty history): ${convStateResult.reason?.message}`);
            }

            // Merge classifier entities into conversation state
            const prevEntities = (convState?.collected_entities && typeof convState.collected_entities === 'object')
                ? convState.collected_entities
                : {};
            const mergedEntities = { ...prevEntities, ...classification.entities };

            // ── Canned response short-circuit ───────────────────────
            if (classification.cannedResponse) {
                history.push({ role: 'user', content: userMessage });
                history.push({ role: 'assistant', content: classification.cannedResponse });
                while (history.length > this.maxHistory) history.shift();

                try {
                    await Promise.race([
                        db.saveConversationState(phoneNumber, {
                            history,
                            pending_intent:     convState?.pending_intent || null,
                            collected_entities: mergedEntities,
                            turn_count:         (convState?.turn_count || 0) + 1,
                        }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('saveConversationState: 2s timeout')), 2000)
                        ),
                    ]);
                } catch (e) {
                    logger.warn(`⚠️ saveConversationState (canned) failed: ${e.message}`);
                }

                const responseTime = Date.now() - startTime;
                logger.info(`⚡ Canned response (${classification.intent}) in ${responseTime}ms`);
                clearTimeout(abortTimer);
                return {
                    response: classification.cannedResponse,
                    responseTime,
                    toolsUsed: [],
                    toolCallCount: 0,
                    escalated: false,
                    fromCache: true,
                };
            }

            // ── Full LLM path ───────────────────────────────────────
            if (!this.client) {
                clearTimeout(abortTimer);
                return this._fallbackResponse(userMessage, startTime);
            }

            this._evictOldestIfFull();
            this.conversationHistory.set(phoneNumber, history);
            this.conversationLastAccess.set(phoneNumber, Date.now());

            history.push({ role: 'user', content: userMessage });
            while (history.length > this.maxHistory) history.shift();

            // ── Use RAG result from parallel fetch ──────────────────
            const MAX_RAG_CHARS = 300; // Cap tokens — free tier is tight (100k TPD)
            let ragContext = '';
            if (ragResult.status === 'fulfilled' && ragResult.value) {
                ragContext = ragResult.value.substring(0, MAX_RAG_CHARS);
                logger.info(`📚 RAG: injected ${ragContext.length} chars of context`);
            } else if (ragResult.status === 'rejected') {
                logger.warn(`⚠️ RAG failed (continuing without): ${ragResult.reason?.message}`);
            }
            // Re-run RAG with prevEntities only if initial parallel fetch missed them
            if (!ragContext && Object.keys(prevEntities).length > 0) {
                try {
                    const retry = await retrieveContext(classification.intent, classification.entities, prevEntities);
                    if (retry) {
                        ragContext = retry.substring(0, MAX_RAG_CHARS);
                        logger.info(`📚 RAG retry with prevEntities: ${ragContext.length} chars`);
                    }
                } catch (e) {
                    logger.warn(`⚠️ RAG retry failed: ${e.message}`);
                }
            }

            // ── Build messages ──────────────────────────────────────
            // Inject classifier context so the LLM doesn't waste tokens re-extracting
            let classifierHint = '';
            if (classification.intent !== 'unknown') {
                classifierHint += `\n\n## سياق المصنّف (classifier context):`;
                classifierHint += `\n- النية المكتشفة: ${classification.intent} (ثقة: ${classification.confidence})`;
                if (convState?.pending_intent && convState.pending_intent !== classification.intent) {
                    classifierHint += `\n- نية معلّقة من الرسالة السابقة: ${convState.pending_intent}`;
                }
            }
            if (Object.keys(mergedEntities).length > 0) {
                classifierHint += `\n- الكيانات المستخرجة (تراكمي): ${JSON.stringify(mergedEntities)}`;
                classifierHint += `\n- استخدم هذه الكيانات مباشرة عند استدعاء الأدوات — لا تسأل المستخدم عنها مرة ثانية.`;
            }

            // P0-04: Keep write tools enabled on the fallback model. Previously we
            // stripped `book_maintenance`/`submit_support_ticket`/`create_purchase_inquiry`
            // when the primary model's TPD was exhausted, because the weaker model
            // was prone to calling them with missing args. That silently broke the
            // whole booking flow whenever we hit TPD — the customer would say
            // "احجز لي موعد" and the model would have no booking tool to call.
            //
            // Now the tool boundary itself (P0-02) rejects under-specified calls
            // with `{needs_more_info: true, missing_fields: [...]}`, which the LLM
            // handles correctly on both models. We keep the full tool set and
            // add a stronger reminder to the system prompt on fallback instead.
            const onFallback = this._primaryModelExhausted;
            const activeModel = onFallback ? this.fallbackModel : this.model;
            const activeTools = TOOL_DEFINITIONS;

            const fallbackReminder = onFallback
                ? `\n\n⚠️ تنبيه مهم: قبل استدعاء book_maintenance أو create_purchase_inquiry أو submit_support_ticket، تأكد أنك جمعت كل الحقول المطلوبة من العميل (ماركة، موديل، خدمة، تاريخ، وقت، فرع). إذا ناقص حقل — اسأل العميل عنه أولاً، ولا تخترع قيم ولا تفترض.`
                : '';

            const systemNote = customerName
                ? `${SYSTEM_PROMPT}${ragContext}${classifierHint}${fallbackReminder}\nالعميل: ${customerName} | رقمه: ${phoneNumber}`
                : `${SYSTEM_PROMPT}${ragContext}${classifierHint}${fallbackReminder}\nرقم العميل: ${phoneNumber}`;

            const messages = [
                { role: 'system', content: systemNote },
                ...history
            ];

            if (onFallback) {
                logger.warn(`⚠️ Running on fallback model (${this.fallbackModel}) — primary TPD exhausted. Write tools REMAIN ENABLED.`);
            }

            // Reasoning models (Qwen3, QwQ, R1 …) consume output tokens for
            // their chain-of-thought before emitting the final answer. With
            // `reasoning_format: 'hidden'` the CoT is dropped from the
            // response but it still counts against max_tokens, so we need a
            // larger budget. 3000 is comfortable — ~2500 for CoT + ~500 for
            // the Arabic reply. Non-reasoning models keep the tight 450.
            const reasoning = this._reasoningParamsFor(activeModel);
            const usingReasoning = Object.keys(reasoning).length > 0;

            const llmParams = {
                model: activeModel,
                tools: activeTools,
                tool_choice: 'auto',
                max_tokens: usingReasoning ? 3000 : 450,
                temperature: usingReasoning ? 0.6 : 0.2, // Qwen3 docs recommend 0.6 when reasoning is on
                ...reasoning,
            };

            if (usingReasoning) {
                logger.info(`🧠 Reasoning enabled (${activeModel}) — effort=${reasoning.reasoning_effort} format=hidden max_tokens=${llmParams.max_tokens}`);
            }

            // ── First LLM call ──────────────────────────────────────
            let response = await this._callGroq({ ...llmParams, messages }, abortController.signal);

            let assistantMessage = response.choices[0].message;
            let toolCallCount = 0;
            const toolsUsed = [];
            let lastToolResults = []; // kept for graceful degradation if LLM2 fails

            // ── Tool deduplication cache (per request) ──────────────
            // LLMs sometimes call the same read-only tool twice — once via LLM1 and
            // again when LLM2 (the post-tool-execution response) decides it needs more
            // data. This cache intercepts duplicate calls and returns the prior result
            // instantly, saving 4-10s per duplicated tool call.
            //
            // Only pure-read tools are cached — write tools (book_maintenance, etc.)
            // must always execute.
            const CACHEABLE_TOOLS = new Set([
                'search_cars', 'check_parts_inventory', 'get_promotions',
                'get_branch_info', 'compare_cars', 'get_customer_bookings',
                'check_availability', 'calculate_financing', 'check_branch_availability',
            ]);
            const toolResultCache = new Map(); // key: "toolName:argsJSON" → resultJSON

            // ── Tool-call loop (parallel execution per round) ───────
            // NOTE: `toolCallCount` is the ROUND counter — each `while`
            // iteration is one LLM turn that can dispatch multiple tools
            // in parallel. Per-tool identity is logged via the (idx,total)
            // slot below so parallel calls don't all share "#1" in logs.
            while (
                assistantMessage.tool_calls?.length > 0 &&
                toolCallCount < this.maxToolCalls
            ) {
                toolCallCount++;
                messages.push(assistantMessage);
                const roundToolTotal = assistantMessage.tool_calls.length;

                // ⚡ Execute ALL tool calls in this round in PARALLEL
                const toolResults = await Promise.all(
                    assistantMessage.tool_calls.map(async (toolCall, toolIdx) => {
                        const toolName = toolCall.function.name;
                        let toolArgs = {};
                        try {
                            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                        } catch {
                            logger.warn('⚠️ فشل parse لأرجومنت الأداة:', toolCall.function.arguments);
                        }
                        // LLMs sometimes emit the literal string "null" as arguments
                        // when they call a tool with no args. JSON.parse("null") === null,
                        // which bypasses the `|| '{}'` default and crashes downstream
                        // (e.g. get_branch_info: "Cannot read properties of null (reading 'branch')").
                        // Seen in prod 2026-04-18. Coerce to {} so each case handler
                        // can safely destructure args.
                        if (toolArgs === null || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
                            toolArgs = {};
                        }

                        // ── Dedup check ──────────────────────────────
                        if (CACHEABLE_TOOLS.has(toolName)) {
                            const cacheKey = `${toolName}:${JSON.stringify(toolArgs)}`;
                            if (toolResultCache.has(cacheKey)) {
                                logger.warn(`🚫 Dedup: ${toolName} already called — returning cached result (0ms)`);
                                return {
                                    role: 'tool',
                                    tool_call_id: toolCall.id,
                                    name: toolName,
                                    content: toolResultCache.get(cacheKey),
                                };
                            }
                        }

                        logger.info(
                            `🔧 Round ${toolCallCount} tool ` +
                            `${toolIdx + 1}/${roundToolTotal}: ${toolName}`
                        );
                        toolsUsed.push(toolName);
                        const result = await executeTool(toolName, toolArgs, phoneNumber);
                        const resultStr = JSON.stringify(result);

                        // Store in cache so any duplicate call this turn is instant
                        if (CACHEABLE_TOOLS.has(toolName)) {
                            const cacheKey = `${toolName}:${JSON.stringify(toolArgs)}`;
                            toolResultCache.set(cacheKey, resultStr);
                        }

                        return {
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,  // extra field — used by formatToolFallback
                            content: resultStr,
                        };
                    })
                );
                lastToolResults = toolResults;
                messages.push(...toolResults);

                // ── LLM2: Generate response after tool execution ─────
                // LLM2 just needs to format the tool result into Arabic — it's a short
                // generation task. Give it a DEDICATED budget based on remaining time.
                // If it times out, _formatToolFallback builds an instant Arabic response
                // from the tool result, so the user still gets a useful message.
                //
                // Budget calculation (correctness > latency):
                //   elapsed     = time since generateResponse started
                //   llm2Budget  = min(14s, max(5s, GLOBAL_BUDGET - 1s - elapsed))
                //   Cap raised from 7s → 14s and floor from 3s → 5s so that complex
                //   responses (multiple tool results, long Arabic generation) have
                //   room to finish instead of falling back to the template.
                //
                // Tool pruning:
                //   Remove all already-called cacheable tools from LLM2's tool list.
                //   This prevents LLM2 from issuing a repeat tool call that the cache
                //   would handle at 0ms cost — but more importantly, prevents the
                //   extra LLM round-trip overhead that the cache can't eliminate.
                const calledCacheableTools = new Set(
                    toolsUsed.filter(t => CACHEABLE_TOOLS.has(t))
                );
                const llm2Tools = TOOL_DEFINITIONS.filter(
                    t => !calledCacheableTools.has(t.function?.name)
                );
                logger.info(`🛡️ LLM2 tools: ${TOOL_DEFINITIONS.length} → ${llm2Tools.length} (pruned ${calledCacheableTools.size} already-called)`);

                const elapsed = Date.now() - startTime;
                // Unlimited mode: give LLM2 up to 9 minutes (1 min below global
                // ceiling) so Arabic generation on the 8b-instant model has room
                // to finish even under heavy concurrent load on Groq. On the
                // sync path we keep the 14s cap so we stay inside the 22s global.
                const llm2BudgetMs = unlimited
                    ? Math.max(10000, GLOBAL_BUDGET_MS - 60000 - elapsed)
                    : Math.min(14000, Math.max(5000, GLOBAL_BUDGET_MS - 1000 - elapsed));
                const llm2Abort = new AbortController();
                const llm2Timer = setTimeout(() => {
                    logger.warn(`⏱️ LLM2: ${llm2BudgetMs}ms budget exhausted — using tool fallback`);
                    llm2Abort.abort();
                }, llm2BudgetMs);

                let llm2Failed = false;
                try {
                    // LLM2 only formats tool results → needs fewer tokens → faster.
                    // But reasoning models spend most of their output budget on the
                    // chain-of-thought; if max_tokens is too small the final reply
                    // is truncated or empty. Keep 350 for non-reasoning models,
                    // lift to 2000 when a reasoning model is active.
                    const llm2MaxTokens = usingReasoning ? 2000 : 350;
                    const llm2Params = {
                        ...llmParams,
                        max_tokens: llm2MaxTokens,
                        tools: llm2Tools.length > 0 ? llm2Tools : undefined,
                        tool_choice: llm2Tools.length > 0 ? 'auto' : undefined,
                    };
                    response = await this._callGroq({ ...llm2Params, messages }, llm2Abort.signal);
                    assistantMessage = response.choices[0].message;
                } catch (llm2Err) {
                    logger.warn(`⚠️ LLM2 failed (${llm2Err?.message}) — using tool result template`);
                    llm2Failed = true;
                    // Build template from last tool result
                    for (const tr of toolResults) {
                        const template = this._formatToolFallback(tr.name, tr.content);
                        if (template) {
                            assistantMessage = { content: template, tool_calls: null };
                            break;
                        }
                    }
                    if (!assistantMessage?.content) {
                        assistantMessage = { content: 'تم تنفيذ طلبك ✅\nللمزيد: 06-5000001', tool_calls: null };
                    }
                    break; // exit tool loop — we have a response
                } finally {
                    clearTimeout(llm2Timer);
                }
            }

            const aiText = assistantMessage.content || 'عذراً، صار مشكلة. جرب مرة ثانية.';

            // Save assistant reply to history.
            // We persist ONLY the final text-only assistant message, NOT the
            // intermediate tool-calling steps. This keeps the JSONB row small
            // and avoids re-running tool loops on the next turn (the model only
            // needs the conversational turns to maintain context, not the
            // mechanical tool plumbing — tool results are stale anyway).
            history.push({ role: 'assistant', content: aiText });
            while (history.length > this.maxHistory) history.shift();

            // ── Persist updated state to Supabase ───────────────────
            // Detect tool success → clear pending intent & entities (booking confirmed etc.)
            const completedTools = new Set([
                'book_maintenance',
                'submit_support_ticket',
                'create_purchase_inquiry',
            ]);
            const toolCompleted = toolsUsed.some(t => completedTools.has(t));

            // Resolve pending_intent: if classifier found one, use it;
            // otherwise carry forward from conversation state (multi-turn).
            const resolvedIntent = classification.intent !== 'unknown'
                ? classification.intent
                : (convState?.pending_intent || null);

            const newTurnCount = (convState?.turn_count || 0) + 1;
            try {
                // Hard 2s timeout — if conversation_states table is missing or DB is slow,
                // we must NOT let this hang for 10-12s and cause the Netlify step timeout.
                await Promise.race([
                    db.saveConversationState(phoneNumber, {
                        history,
                        pending_intent:     toolCompleted ? null : resolvedIntent,
                        collected_entities: toolCompleted ? {} : mergedEntities,
                        turn_count:         newTurnCount,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('saveConversationState: 2s timeout')), 2000)
                    ),
                ]);
            } catch (e) {
                logger.warn(`⚠️ saveConversationState failed (continuing): ${e.message}`);
            }

            const responseTime = Date.now() - startTime;
            logger.info(`✅ AI: ${responseTime}ms | أدوات: ${toolCallCount} [${toolsUsed.join(', ')}] | turn=${newTurnCount}`);

            clearTimeout(abortTimer);
            return {
                response: aiText,
                responseTime,
                toolsUsed,
                toolCallCount,
                escalated: toolsUsed.includes('submit_support_ticket'),
                fromCache: false,
            };

        } catch (error) {
            clearTimeout(abortTimer);
            logger.error('❌ AI Error:', error.message);
            return this._fallbackResponse(userMessage, startTime);
        }
    }

    _fallbackResponse(message, startTime) {
        const msg = (message || '').toLowerCase();
        let response;

        // NOTE: Order matters — check maintenance BEFORE generic "سيارة" to avoid
        // misclassifying "صيانة للسيارة" as a car purchase intent.
        if (msg.includes('هلا') || msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('هاي') || msg.includes('اهلا')) {
            response = 'هلا والله! أهلين فيك بأوتو جوردن 🚗\nكيف بقدر أساعدك اليوم؟\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض\n5️⃣ أحكي مع موظف';
        } else if (msg.includes('صيانة') || msg.includes('موعد') || msg.includes('احجز') || msg.includes('حجز') || msg.includes('اصلح') || msg.includes('صلح') || msg.includes('تصليح') || msg.includes('سيرفس')) {
            response = 'تكرم! 🔧 محتاج منك:\n• نوع الخدمة (صيانة / فرامل / مكيف...)\n• ماركة السيارة وموديلها\n• الفرع (عمان/إربد/الزرقاء/العقبة)\n\nاحكيلي وبحجزلك فوراً!';
        } else if (msg.includes('فرع') || msg.includes('فروع') || msg.includes('عنوان') || msg.includes('وين')) {
            response = 'عنا 4 أفرع 📍\n1️⃣ عمان - شارع المدينة المنورة\n2️⃣ إربد - شارع الجامعة\n3️⃣ الزرقاء - شارع الأمير محمد\n4️⃣ العقبة - شارع الملك الحسين\n\nتلفون: 06-5000001';
        } else if (msg.includes('قطع') || msg.includes('غيار') || msg.includes('سبير') || msg.includes('فلتر') || msg.includes('بطارية')) {
            response = 'أكيد! شو القطعة ولأي سيارة؟ 🔩';
        } else if (msg.includes('موظف') || msg.includes('حدا') || msg.includes('شكوى') || msg.includes('مدير')) {
            response = 'تكرم يا غالي 📱 تلفون: 06-5000001\nأو افتحلك تذكرة ويتواصلوا معك.';
        } else if (msg.includes('سيارة') || msg.includes('شراء') || msg.includes('اشتري') || msg.includes('تويوتا') || msg.includes('كيا') || msg.includes('هيونداي') || msg.includes('نيسان')) {
            response = 'أهلين! عنا سيارات جديدة ومستعملة 🚗\nشو الماركة اللي بتفضلها وميزانيتك؟';
        } else {
            response = 'أهلين بأوتو جوردن! 🚗\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض\n5️⃣ موظف\n\nاحكيلي شو بتحتاج!';
        }

        return {
            response,
            responseTime: Date.now() - startTime,
            toolsUsed: [],
            toolCallCount: 0,
            escalated: false,
            fromCache: false,
        };
    }

    async clearHistory(phoneNumber) {
        this.conversationHistory.delete(phoneNumber);
        this.conversationLastAccess.delete(phoneNumber);
        try {
            await db.clearConversationState(phoneNumber);
        } catch (e) {
            logger.warn(`clearConversationState failed: ${e.message}`);
        }
    }

    getHistory(phoneNumber) {
        return this.conversationHistory.get(phoneNumber) || [];
    }
}

module.exports = new GeminiService();
