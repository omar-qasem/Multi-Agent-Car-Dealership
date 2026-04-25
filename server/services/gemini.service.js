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
const { formatToolFallback } = require('../utils/response-templates');
const { getFlowDirective, buildFlowContext, advanceFlowState } = require('./flow-engine');

// =============================================
// System Prompt — Composable Sections
// =============================================
// Split into named constants so each section can be tested, updated, and
// conditionally injected independently. FLOW_CONTEXT is injected at runtime
// by the flow engine based on the current conversation state.

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Comprehensive agent instructions for أبو الزوز
// Sections: Identity · Rules · Workflows · Tool Guide · Domain Info
// FLOW_CONTEXT, RAG context, customer memory, and date are injected at runtime.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = '# أبو الزوز — مساعد أوتو جوردن 🚗\n\n' +
'## الشخصية:\n' +
'أنت "أبو الزوز"، المساعد الذكي لمعرض أوتو جوردن للسيارات في الأردن.\n' +
'- تحكي بلهجة أردنية ودية ومباشرة، بدون مقدمات أو تكرار\n' +
'- إيموجي خفيف (🚗 🔧 ✅ 💰 📍) — لا تبالغ\n' +
'- **سؤال واحد فقط في كل رسالة** — لا تسأل أكثر من سؤال دفعة واحدة\n' +
'- ردودك قصيرة وعملية — العميل على واتساب مش على بريد إلكتروني\n\n' +
'---\n\n' +
'## ⛔ قواعد صارمة (لا استثناء):\n' +
'1. **ممنوع اختراع أسعار أو أرقام** — استخدم فقط ما تجلبه الأدوات أو السياق\n' +
'2. **ممنوع تأكيد حجز** بدون booking_id حقيقي من book_maintenance\n' +
'3. **ممنوع استدعاء أداة كتابة** (book_maintenance / create_purchase_inquiry / submit_support_ticket) قبل جمع **كل** حقولها\n' +
'4. **خطأ تقني** → "واجهنا مشكلة بسيطة، اتصل 06-5000001" فقط\n' +
'5. **بيانات RAG في السياق؟** → اعتمد عليها مباشرة، لا تعيد استدعاء search_cars أو check_parts_inventory\n' +
'6. **ذاكرة العميل مرجعية فقط** — ما يقوله في رسالته الحالية يأخذ الأولوية على الذاكرة\n' +
'7. **ممنوع وصف استخدام الأداة للعميل** — لا تكتب "سأستخدم أداة X" أو "حسناً استخدم أداة Y" أو "ابحث عن..." — استدعِ الأداة مباشرةً بصمت\n' +
'8. **ممنوع X أو [...] كمكان شاغر** — إذا ما عندك معلومة اسأل سؤالاً محدداً — لا تُرسل رسالة ناقصة تحتوي X أو [اسم] أو مكان شاغر\n' +
'9. **compare_cars** — استخدم الماركة والموديل اللي ذكرهم العميل فقط — لا تخترع موديلات من عندك\n' +
'10. **سياق الشراء والصيانة لا يختلطان أبداً** — `check_branch_availability` و`book_maintenance` لصيانة السيارات حصراً. إذا كان pending_intent=purchase أو ظهرت نتائج search_cars → أي ذكر لوقت/تاريخ/حجز/موعد من العميل يعني اختبار قيادة أو تسليم سيارة → استدعِ create_purchase_inquiry فقط. لا تستدعِ book_maintenance في سياق الشراء أبداً حتى لو قال "بكرا الساعة 5" أو "عال٥ العصر".\n' +
'11. **اختيار من نتائج البحث** — إذا قال العميل "[لون]/الأولى/الثانية/هاي/هادي" بعد ما عرضت search_cars → لا تبدأ search_cars من جديد ولا تسأل "شو الماركة" — ابحث في تاريخ المحادثة عن السيارة التي يقصدها واستدعِ create_purchase_inquiry مباشرة\n\n' +
'---\n\n' +
'## 🔧 حجز الصيانة:\n\n' +
'**خدمات مقبولة:** صيانة دورية، تغيير زيت، فرامل/بريك، مكيف، كهرباء، إطارات/كوشوك، بنشر/مبشر، سمكرة ودهان، تظليل شبابيك، بطارية، تبديل زجاج، فحص شامل، برمجة، ناقل حركة، حزام توقيت، عادم\n\n' +
'**حقول مطلوبة:** نوع الخدمة | ماركة السيارة | الموديل | التاريخ (YYYY-MM-DD) | الفرع\n\n' +
'**الخطوات:**\n' +
'1. اجمع الحقول الناقصة — سؤال واحد في كل رد\n' +
'2. استدعِ check_branch_availability(branch, date) — اعرض الأوقات المتاحة\n' +
'3. إذا ممتلئ → اقترح تواريخ بديلة (+1 يوم، +2 يوم)\n' +
'4. بعد اختيار الوقت → استدعِ book_maintenance بكل الحقول\n' +
'5. بعد booking_id → أكّد: رقم الحجز، التاريخ، الوقت، الفرع\n\n' +
'⚠️ تغيير الفرع أثناء الحجز → check_branch_availability بالفرع الجديد (مش search_cars)\n\n' +
'---\n\n' +
'## 🚗 شراء سيارة:\n\n' +
'1. اعرض نتائج RAG مباشرة إذا موجودة\n' +
'2. وإلا → استدعِ search_cars مع الفلاتر: make, model, max_price, branch, condition, fuel_type\n' +
'3. العميل ذكر فرعاً؟ → أضف branch لـ search_cars (لا تستدعِ check_branch_availability — تلك للصيانة فقط)\n' +
'4. اهتمام جدي بسيارة → استدعِ create_purchase_inquiry (اسأل: تقسيط؟ سيارة للبدل؟)\n\n' +
'**التقسيط:** اجمع (سعر + دفعة أولى + مدة بالشهور، افتراضي 36) → calculate_financing\n' +
'**الاستبدال:** نقيّم مجاناً في أي فرع ونطرح القيمة من سعر السيارة الجديدة\n\n' +
'---\n\n' +
'## 🔩 قطع الغيار:\n' +
'1. اسأل عن اسم القطعة والسيارة إذا لم يُذكرا\n' +
'2. استدعِ check_parts_inventory أو اعتمد على بيانات RAG\n' +
'3. ما عندنا القطعة → "مو متوفرة هلأ، تقدر تطلبها وبيتواصلوا معك"\n\n' +
'---\n\n' +
'## 🎯 الأداة الصحيحة لكل موقف:\n' +
'- بحث عن سيارات للشراء → search_cars\n' +
'- "هل عندكم X؟" / "كم واحدة؟" → check_availability\n' +
'- مقارنة موديلين → compare_cars\n' +
'- مواعيد فرع للصيانة → check_branch_availability\n' +
'- حجز صيانة → book_maintenance\n' +
'- حساب تقسيط → calculate_financing\n' +
'- استفسار شراء جدي → create_purchase_inquiry\n' +
'- قطع غيار → check_parts_inventory\n' +
'- حجوزات سابقة → get_customer_bookings\n' +
'- عروض → get_promotions\n' +
'- عنوان/ساعات فرع → get_branch_info\n' +
'- شكوى / موظف / تعديل → submit_support_ticket\n\n' +
'---\n\n' +
'## 🏢 معلومات أوتو جوردن:\n\n' +
'📞 06-5000001\n' +
'الأفرع: عمان (شارع المدينة المنورة) | إربد (شارع الجامعة) | الزرقاء (شارع الأمير محمد) | العقبة (شارع الملك الحسين)\n' +
'الدوام: أحد-خميس 8ص-8م | جمعة 8ص-2م | سبت 8ص-6م\n' +
'الماركات: Toyota, Hyundai, Kia, MG, Chery, Nissan, BMW\n' +
'الدفع: كاش | بطاقة | تحويل | تقسيط حتى 60 شهر\n' +
'الضمان: جديدة 3-5 سنوات | مستعملة معتمدة 6 أشهر/10,000 كم | صيانة 3 أشهر/5,000 كم\n\n' +
'---\n\n' +
'## 🔄 حالات خاصة:\n' +
'- تعديل/استفسار حجز قديم → get_customer_bookings ثم submit_support_ticket\n' +
'- شكوى أو طلب مدير → submit_support_ticket (priority=high)\n' +
'- سؤال غير واضح → اسأل سؤالاً واحداً لتوضيح النية\n' +
'- العميل يرفض الخيارات → "تفهمك، اتصل 06-5000001 ومنلاقيلك حل"\n' +
'- خارج الدوام → رد وخزّن الطلب، يتواصلوا معه أول الدوام\n' +
'- **اسم العميل يشبه اسم سيارة/ماركة** → اعتمد على السياق: إذا سألته "ما ماركة سيارتك؟" وردّ بكلمة واحدة — هذي الكلمة هي الماركة وليست تحية، لا تردّ كأنها سلام';

// Shorter prompt for the fallback model (llama-3.1-8b-instant after 413)
const PROMPT_FALLBACK =
'أنت "أبو الزوز" مساعد أوتو جوردن 🚗. لهجة أردنية ودية، ردود قصيرة، سؤال واحد في كل رد.\n\n' +
'قواعد: ممنوع اختراع أسعار | ممنوع تأكيد حجز بدون booking_id | ممنوع استدعاء أداة كتابة قبل جمع كل حقولها | خطأ تقني → "واجهنا مشكلة، اتصل 06-5000001" | ذاكرة العميل مرجعية فقط — ما يقوله الآن يأخذ الأولوية\n' +
'ممنوع وصف استخدام أداة للعميل — استدعِ الأداة بصمت ولا تكتب "سأستخدم أداة X" | ممنوع كتابة X كمكان شاغر — اسأل العميل إذا ما عندك المعلومة\n\n' +
'الحجز: اجمع (خدمة + ماركة + موديل + تاريخ + فرع) → check_branch_availability → book_maintenance\n' +
'⛔ إذا كان pending_intent=purchase في السياق → لا تستدعِ check_branch_availability أو book_maintenance أبداً حتى لو ذكر العميل وقتاً — هذا لاختبار القيادة → استدعِ create_purchase_inquiry\n' +
'الشراء: search_cars بالفلاتر → create_purchase_inquiry عند الاهتمام الجدي\n' +
'القطع: check_parts_inventory | شكوى/موظف: submit_support_ticket\n\n' +
'أوتو جوردن: 📞 06-5000001 | عمان، إربد، الزرقاء، العقبة | أحد-خميس 8ص-8م | جمعة 8ص-2م | سبت 8ص-6م';

// =============================================
// AI Service Class
// =============================================
class GeminiService {
    constructor() {
        this.client = null;
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
        this.maxHistory    = 10;  // Last 5 turns — keeps input under 6K TPM for qwen3-32b
        this.maxToolCalls  = 3;   // Hard cap on tool round-trips
        this._initialize();
        this._loadPersistedFlags(); // async, non-blocking
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

    /**
     * On cold start, restore the Groq TPD exhaustion flag from Supabase so
     * a fresh Lambda instance doesn't re-hit the already-exhausted quota.
     */
    async _loadPersistedFlags() {
        try {
            const tpdDate = await db.getSystemFlag('groq_tpd_exhausted');
            const today   = this._currentUtcDate();
            if (tpdDate && tpdDate === today) {
                this._primaryModelExhausted = true;
                this._exhaustedUtcDate      = today;
                logger.warn(`⚠️ Groq TPD flag restored from DB — primary model exhausted (${today}), using fallback: ${this.fallbackModel}`);
            }
        } catch { /* non-critical — worst case we hit TPD once on cold start */ }
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
            db.setSystemFlag('groq_tpd_exhausted', '').catch(() => {});
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

                // 413 Request Too Large — prompt + max_tokens exceeds the model's
                // per-minute token budget on the current Groq service tier.
                // qwen/qwen3-32b on free/on_demand = 6K TPM; our typical request
                // (system prompt + 12 tools + history + reasoning budget) = ~6900 tokens.
                // Retry with llama-3.1-8b-instant (20K TPM on free tier), a shorter
                // output budget, and trimmed history so the retry fits in one shot.
                if (status === 413 && attempt < 2) {
                    const requested = msg.match(/Requested (\d+)/)?.[1] || '?';
                    // Fall back to llama-3.3-70b-versatile (TPM: 12K+) which KEEPS tool
                    // support. Previously used llama-3.1-8b-instant with tools stripped,
                    // causing the model to narrate tool calls as text instead of executing
                    // them — breaking every flow that needs search_cars, book_maintenance, etc.
                    logger.warn(`⚠️ Groq 413: request too large (${effectiveParams.model}, ~${requested} tokens) — falling back to ${this.fallbackModel} with trimmed context`);
                    const allMsgs = effectiveParams.messages || [];
                    const sysMsg  = allMsgs.find(m => m.role === 'system');
                    const nonSys  = allMsgs.filter(m => m.role !== 'system').slice(-6);
                    effectiveParams.messages  = sysMsg ? [sysMsg, ...nonSys] : nonSys;
                    effectiveParams.max_tokens = 600;
                    effectiveParams.model      = this.fallbackModel;
                    // Remove reasoning params — llama models don't support them.
                    // Tools stay enabled: llama-3.3-70b-versatile handles tool calls well.
                    delete effectiveParams.reasoning_effort;
                    delete effectiveParams.reasoning_format;
                    continue;
                }

                // 400 tool_use_failed — model emitted tool calls in a bad format.
                // Retry without tools so the model gives a plain text response.
                if (status === 400 && err?.error?.code === 'tool_use_failed' && attempt < 2) {
                    logger.warn(`⚠️ Groq tool_use_failed (${effectiveParams.model}) — retrying without tools`);
                    effectiveParams.tools       = undefined;
                    effectiveParams.tool_choice = undefined;
                    continue;
                }

                // 400 model_decommissioned — the GROQ_MODEL env var points to a
                // retired model. Override to the hardcoded safe default and retry.
                if (status === 400 && err?.error?.code === 'model_decommissioned' && attempt < 2) {
                    const deadModel = effectiveParams.model;
                    effectiveParams.model = 'qwen/qwen3-32b';
                    logger.warn(`⚠️ Groq model decommissioned: ${deadModel} — auto-switching to qwen/qwen3-32b. Update GROQ_MODEL env var.`);
                    continue;
                }

                if (status === 429 && attempt < 2) {
                    // Detect daily quota (TPD) via error code OR message string.
                    // Groq returns error.code='rate_limit_exceeded' with type='tokens'
                    // for both TPM and TPD; the 'day' substring distinguishes them.
                    const isTPD = /tokens per day/i.test(msg)
                        || (err?.error?.code === 'rate_limit_exceeded' && /day/i.test(msg));

                    if (isTPD) {
                        // Daily quota exhausted — waiting is futile (42+ min).
                        // Switch to fallback model for the rest of the UTC day.
                        this._primaryModelExhausted = true;
                        this._exhaustedUtcDate = this._currentUtcDate();
                        logger.warn(`⚠️ Groq TPD exhausted for ${effectiveParams.model} — switching to fallback: ${this.fallbackModel} until UTC ${this._exhaustedUtcDate} rolls over`);
                        // Persist across cold starts so fresh Lambda instances skip the primary
                        db.setSystemFlag('groq_tpd_exhausted', this._exhaustedUtcDate).catch(() => {});
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

                // Connection / 5xx errors — retry once with 500ms delay
                const isTransient = (msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('network'))
                    || (status >= 500 && status <= 503);
                if (isTransient && attempt < 2) {
                    logger.warn(`⚠️ Groq transient error (${status || 'network'}) — retrying after 500ms`);
                    await new Promise(r => setTimeout(r, 500));
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
     * Sanitize LLM output before sending to WhatsApp:
     *   1. Strip <think>…</think> blocks (reasoning model leakage)
     *   2. Strip bare JSON objects/arrays (tool result leakage)
     *   3. Truncate to WhatsApp's 4096-char limit
     * Returns null if nothing usable remains — caller falls back to template.
     */
    _sanitizeOutput(text) {
        if (!text || typeof text !== 'string') return null;

        // 1. Strip reasoning chain leakage
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // 2. Strip responses that are purely JSON (tool result accidentally returned)
        //    Heuristic: starts with { or [ and ends with } or ]
        if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(text)) {
            logger.warn('⚠️ sanitizeOutput: stripped raw JSON response from LLM');
            return null;
        }

        // 3a. Strip tool-narration leakage: model described what tool it planned to use
        //     instead of actually calling the tool (empty tool_calls, text-only response)
        const TOOL_NAMES = 'search_cars|book_maintenance|check_parts_inventory|compare_cars|check_branch_availability|check_availability|calculate_financing|get_promotions|get_branch_info|submit_support_ticket|create_purchase_inquiry|get_customer_bookings';
        const NARRATION_PATTERNS = [
            /استخدم أداة\s+\w+/i,                       // "استخدم أداة compare_cars"
            new RegExp(`استخدم\\s+(${TOOL_NAMES})\\b`, 'i'), // "استخدم search_cars مع الفلاتر"
            /سأستخدم أداة/i,
            /بستخدم أداة/i,
            /استدعِ\s+\w+/i,
            /ابحث عن .{4,} في المخزون/i,
            /\bmake\s*=\s*\w+.{0,80}\bmodel\s*=\s*\w+/i, // "make = Kia, model = Cerato"
        ];
        if (NARRATION_PATTERNS.some(p => p.test(text))) {
            logger.warn('⚠️ sanitizeOutput: stripped tool-narration leakage from LLM response');
            return null;
        }

        // 3b. Strip responses that contain a bare "X" placeholder (model didn't fill a value)
        //     Only trigger on short responses to avoid false positives on car names like "MX-5"
        if (text.length < 200 && /(?<!\w)X(?!\w)/.test(text)) {
            logger.warn('⚠️ sanitizeOutput: stripped X-placeholder response from LLM');
            return null;
        }

        // 3. Enforce WhatsApp 4096-char limit
        if (text.length > 4096) {
            text = text.substring(0, 4050) + '\n\n... للمزيد اتصل 06-5000001';
        }

        return text || null;
    }

    _formatToolFallback(toolName, toolResult) {
        return formatToolFallback(toolName, toolResult);
    }

    /**
     * Return only the tools relevant to the current intent + context.
     * Sending all 12 tools every turn costs ~1800-2400 tokens.
     * Filtering to 2-5 relevant tools saves 800-1500 tokens per turn,
     * keeping total request under qwen3-32b's 6K TPM limit.
     */
    _selectTools(intent, pendingIntent, flowState) {
        const BOOKING   = ['check_branch_availability', 'book_maintenance', 'get_customer_bookings', 'get_branch_info', 'submit_support_ticket'];
        const PURCHASE  = ['search_cars', 'create_purchase_inquiry', 'compare_cars', 'calculate_financing', 'check_availability', 'get_branch_info', 'submit_support_ticket'];
        const PARTS     = ['check_parts_inventory', 'check_availability', 'submit_support_ticket'];
        const INFO      = ['get_promotions', 'get_branch_info', 'submit_support_ticket'];
        const PRICE_MIX = ['check_parts_inventory', 'check_availability', 'search_cars', 'calculate_financing', 'submit_support_ticket'];

        // Active booking flow always gets booking tools regardless of message intent
        const effectiveIntent = (flowState?.flow_id === 'booking' && flowState.step !== 'done')
            ? 'booking'
            : (intent !== 'unknown' && intent !== 'affirmation' ? intent : (pendingIntent || 'unknown'));

        let selected;
        switch (effectiveIntent) {
            case 'booking':   selected = BOOKING;   break;
            case 'purchase':  selected = PURCHASE;  break;
            case 'parts':     selected = PARTS;     break;
            case 'price':     selected = PRICE_MIX; break;
            case 'support':   selected = ['submit_support_ticket']; break;
            case 'promotions':selected = INFO;      break;
            case 'faq_hours': case 'faq_branches': case 'faq_phone':
            case 'faq_payment': case 'faq_warranty': case 'faq_trade_in':
                // FAQ intents hit canned response path — LLM rarely called.
                // If it is called, give it a minimal set.
                selected = ['get_branch_info', 'submit_support_ticket'];
                break;
            default:
                // No context yet — send all tools so nothing is blocked
                return TOOL_DEFINITIONS;
        }

        const nameSet = new Set(selected);
        return TOOL_DEFINITIONS.filter(t => nameSet.has(t.function?.name));
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
        let convState = null;

        try {
            // ── 0. Fast Intent Classifier (<1ms) ────────────────────
            const classification = classify(userMessage);
            logger.info(`🏷️ Classifier: intent=${classification.intent} conf=${classification.confidence} entities=${JSON.stringify(classification.entities)}`);

            // ── 1. PARALLEL: Load conv state + customer profile + RAG ──
            // All three are independent DB calls — run together to save ~2-3s.
            const [convStateResult, customerResult, ragResult] = await Promise.allSettled([
                db.getConversationState(phoneNumber),
                db.getCustomer(phoneNumber),
                // Only run RAG if we'll need LLM (skip for canned responses)
                classification.cannedResponse
                    ? Promise.resolve(null)
                    : retrieveContext(classification.intent, classification.entities, {}),
            ]);

            let history = [];
            if (convStateResult.status === 'fulfilled' && convStateResult.value) {
                convState = convStateResult.value;
                if (convState.history && Array.isArray(convState.history)) {
                    history = convState.history.slice();
                }
            } else if (convStateResult.status === 'rejected') {
                logger.warn(`⚠️ getConversationState failed (using empty history): ${convStateResult.reason?.message}`);
            }

            // ── Customer persistent memory ──────────────────────────
            // Facts saved from previous conversations (car, branch, etc.)
            // injected into every prompt so the AI never forgets the customer's car.
            let customerMemory = '';
            if (customerResult.status === 'fulfilled' && customerResult.value) {
                const cp = customerResult.value;
                const memParts = [];
                if (cp.name)              memParts.push(`الاسم: ${cp.name}`);
                if (cp.car_make)          memParts.push(`سيارته: ${cp.car_make}${cp.car_model ? ' ' + cp.car_model : ''}${cp.car_year ? ' ' + cp.car_year : ''}`);
                if (cp.preferred_branch)  memParts.push(`فرعه المفضل: ${cp.preferred_branch}`);
                if (cp.customer_notes)    memParts.push(`ملاحظات: ${cp.customer_notes}`);
                if (memParts.length > 0) {
                    customerMemory = `\n\n## ذاكرة العميل (من محادثات سابقة — مرجعية فقط):\n${memParts.join('\n')}\nللصيانة: استخدم السيارة المحفوظة إذا لم يذكر العميل غيرها. للشراء أو القطع: لا تفرض الماركة القديمة — إذا ذكر ماركة أو نوعاً مختلفاً في المحادثة الحالية أعطِه الأولوية.`;
                    logger.info(`🧠 Customer memory loaded: ${memParts.join(' | ')}`);
                }
            }

            // Merge classifier entities into conversation state
            const prevEntities = (convState?.collected_entities && typeof convState.collected_entities === 'object')
                ? convState.collected_entities
                : {};
            const mergedEntities = { ...prevEntities, ...classification.entities };

            // ── 30-min idle soft reset ──────────────────────────────
            // After 30 minutes of inactivity, carry customer identity forward
            // but clear the active flow and intent so the LLM starts fresh
            // instead of resuming a stale mid-booking context.
            const IDLE_RESET_MS = 30 * 60_000;
            if (convState?.last_active) {
                const idleMs = Date.now() - new Date(convState.last_active).getTime();
                if (idleMs > IDLE_RESET_MS) {
                    logger.info(`[MEMORY] Soft reset after ${Math.floor(idleMs / 60000)}min idle — clearing flow/intent for ${phoneNumber}`);
                    convState = {
                        ...convState,
                        history:            (convState.history || []).slice(-2), // last exchange only
                        flow_state:         null,
                        pending_intent:     null,
                        collected_entities: {},
                    };
                    history = (convState.history || []).slice();
                }
            }

            // ── Flow engine directive ───────────────────────────────
            // Must run before canned-response short-circuit so an in-progress
            // booking flow is never silently abandoned by a canned reply.
            const flowDirective = getFlowDirective(classification.intent, classification.entities, convState);
            if (flowDirective.mode !== 'none') {
                logger.info(`[FLOW] directive=${flowDirective.mode} collected=${JSON.stringify(flowDirective.flowState?.collected)}`);
            }

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
                            flow_state:         convState?.flow_state || null,
                            version:            convState?.version ?? null,
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
                return this._fallbackResponse(userMessage, startTime, convState);
            }

            history.push({ role: 'user', content: userMessage });
            while (history.length > this.maxHistory) history.shift();

            // ── Use RAG result from parallel fetch ──────────────────
            const MAX_RAG_CHARS = 450; // Kept short to stay under qwen3-32b 6K TPM limit
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
            // Inject classifier context so the LLM doesn't waste tokens re-extracting.
            //
            // CRITICAL FIX: Previously gated on `intent !== 'unknown'`, which meant
            // short contextual replies ("نيتا يو", "العقبة", "بكرا") — the most
            // common in-flow messages — NEVER got the pending_intent injected.
            // The LLM then had no signal it was mid-conversation and would treat
            // the reply as a new topic or greeting. Always inject pending_intent
            // whenever it exists, regardless of the current message's intent.
            let classifierHint = '';
            const pendingIntent = convState?.pending_intent;
            const hasEntities   = Object.keys(mergedEntities).length > 0;

            if (classification.intent !== 'unknown' || pendingIntent || hasEntities) {
                classifierHint += `\n\n## سياق المصنّف (classifier context):`;

                if (classification.intent !== 'unknown') {
                    classifierHint += `\n- النية المكتشفة: ${classification.intent} (ثقة: ${classification.confidence})`;
                }

                // Always surface the pending intent — even when current message is 'unknown'.
                // Add an explicit note for the LLM when the reply looks contextual (short
                // unknown message during an active flow) so it doesn't mistake it for a
                // greeting or a brand-new request.
                if (pendingIntent) {
                    classifierHint += `\n- النية المستمرة من المحادثة: ${pendingIntent}`;
                    if (classification.intent === 'unknown') {
                        classifierHint += ` — هذه رسالة ضمن محادثة جارية، ليست تحية ولا موضوع جديد`;
                    }
                }

                // Purchase context hard-block: when we know the customer is in a purchase
                // flow, any mention of time/date/appointment must be a test-drive request —
                // NEVER a maintenance booking. This fires on unknown + affirmation replies
                // like "طيب عال5 العصر اذا" that the model might otherwise misread as a
                // maintenance time slot combined with customer memory (car + branch).
                if (pendingIntent === 'purchase' && (classification.intent === 'unknown' || classification.intent === 'affirmation')) {
                    classifierHint += `\n- ⛔ سياق الشراء نشط: لا تستدعِ check_branch_availability أو book_maintenance — هذه أدوات الصيانة فقط. إذا ذكر العميل وقتاً أو تاريخاً (مثل "عال5 العصر"/"بكرا") → هذا موعد اختبار قيادة أو تسليم → استدعِ create_purchase_inquiry.`;
                }

                // Affirmation: explicit signal that customer is saying "yes" to prior question.
                // Tell the LLM what context to interpret this against so it doesn't default
                // to a generic greeting or switch to a different flow (e.g. maintenance).
                if (classification.intent === 'affirmation') {
                    classifierHint += `\n- ⚡ "${userMessage.trim()}" = موافقة/تأكيد إيجابي على آخر سؤال/عرض قدمته`;
                    if (pendingIntent === 'purchase') {
                        classifierHint += ` — السياق: شراء سيارة. إذا أكد اهتمامه بسيارة → استدعِ create_purchase_inquiry (مش book_maintenance)`;
                    } else if (pendingIntent === 'booking') {
                        classifierHint += ` — السياق: حجز صيانة. استمر في جمع بيانات الحجز`;
                    } else {
                        classifierHint += ` — راجع تاريخ المحادثة لتفهم ماذا كان سؤالك السابق`;
                    }
                }

                // Purchase-from-results: customer is selecting a car from search results
                // already shown in this conversation, not starting a new search.
                // Fires when: current intent=purchase AND previous turn was also purchase
                // (pendingIntent=purchase) AND no specific car make/model was mentioned —
                // meaning they're referencing by color, position ("الأولى"), or pronoun.
                if (
                    classification.intent === 'purchase' &&
                    pendingIntent === 'purchase' &&
                    !mergedEntities.car_make &&
                    !mergedEntities.car_model
                ) {
                    classifierHint += `\n- ⚡ العميل يختار سيارة من نتائج بحث عرضتها في المحادثة (ما ذكر ماركة أو موديل جديد) — راجع تاريخ المحادثة لتحديد أي سيارة يقصد (بالوصف أو اللون أو الترتيب)، ثم استدعِ create_purchase_inquiry مباشرة. لا تبدأ search_cars من جديد ولا تسأل "شو الماركة".`;
                    if (mergedEntities.color) {
                        classifierHint += ` اللون المطلوب: ${mergedEntities.color}.`;
                    }
                }

                if (hasEntities) {
                    classifierHint += `\n- الكيانات المستخرجة (تراكمي): ${JSON.stringify(mergedEntities)}`;
                    classifierHint += `\n- استخدم هذه الكيانات مباشرة عند استدعاء الأدوات — لا تسأل المستخدم عنها مرة ثانية.`;
                }
            }

            // Short in-flow reply guard: when the customer sends ≤4 words during
            // an active booking collection step and the classifier returns no intent,
            // their reply is almost certainly the answer to the AI's last question.
            // Inject an explicit note so the LLM extracts the value and moves on
            // instead of treating it as a greeting or failing to understand context.
            if (
                flowDirective.mode === 'collect' &&
                classification.intent === 'unknown' &&
                userMessage.trim().split(/\s+/).length <= 4
            ) {
                classifierHint += `\n- ⚡ رد قصير في وسط حجز: "${userMessage.trim()}" هو جواب على آخر سؤال طرحته — استخرج القيمة منه مباشرة ولا تعامله كتحية`;
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
            const activeTools = this._selectTools(classification.intent, pendingIntent, convState?.flow_state);
            logger.info(`🔧 Tools: ${activeTools.length}/${TOOL_DEFINITIONS.length} selected (intent=${classification.intent} pending=${pendingIntent || 'none'})`);

            const fallbackReminder = onFallback
                ? `\n\n⚠️ تنبيه مهم: قبل استدعاء book_maintenance أو create_purchase_inquiry أو submit_support_ticket، تأكد أنك جمعت كل الحقول المطلوبة من العميل (ماركة، موديل، خدمة، تاريخ، وقت، فرع). إذا ناقص حقل — اسأل العميل عنه أولاً، ولا تخترع قيم ولا تفترض.`
                : '';

            // Flow context sits between the static system prompt and RAG context
            // so the LLM sees the booking state before any retrieved knowledge.
            const flowContext = buildFlowContext(flowDirective);

            // Use the shorter PROMPT_FALLBACK when on the fallback model to
            // save tokens and keep it focused (the workflow section is mostly
            // for the reasoning model's step-by-step planning).
            const basePrompt = onFallback ? PROMPT_FALLBACK : SYSTEM_PROMPT;

            // Inject today's date so the model never invents stale dates from training data.
            const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const dateHint = `\n\n📅 تاريخ اليوم: ${todayStr} — استخدم هذا التاريخ كمرجع لأي حجز أو فحص توفر.`;

            // Wrap customer name in guillemets + explicit metadata label so the LLM
            // never confuses it with a message the customer just sent. Without this,
            // a customer whose WhatsApp name matches their car model (e.g. "نيتا يو")
            // causes the LLM to greet them mid-booking instead of storing the value.
            const customerMeta = customerName
                ? `[بيانات العميل] اسم واتساب: «${customerName}» | رقم: ${phoneNumber} — هذا اسم الملف الشخصي فقط، لا تخلطه مع ردوده في المحادثة`
                : `[بيانات العميل] رقم: ${phoneNumber}`;
            const systemNote = `${basePrompt}${customerMemory}${flowContext}${ragContext}${classifierHint}${fallbackReminder}${dateHint}\n${customerMeta}`;

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
            // response but it still counts against max_tokens.
            //
            // Budget: 1000 for reasoning models (CoT ~500 + response ~500) keeps total
            // request (input ~3400 + output 1000) at ~4400 tokens — safely under the
            // 6K TPM limit for qwen/qwen3-32b on Groq free tier, avoiding 413 entirely.
            // WARNING: do NOT reduce below 1000 for reasoning models — the CoT alone
            // consumes ~500-600 tokens, leaving fewer than 100 for the actual answer
            // which causes the model to output truncated error messages ("صار مشكلة").
            const reasoning = this._reasoningParamsFor(activeModel);
            const usingReasoning = Object.keys(reasoning).length > 0;

            const llmParams = {
                model: activeModel,
                tools: activeTools,
                tool_choice: 'auto',
                max_tokens: usingReasoning ? 1000 : 400,
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

                try {
                    // LLM2 only formats tool results → needs fewer tokens → faster.
                    // Keep 350 for non-reasoning models; 1000 for reasoning models
                    // (enough for CoT + Arabic reply, stays within 6K TPM budget).
                    const llm2MaxTokens = usingReasoning ? 1000 : 350;
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

            const aiText = this._sanitizeOutput(assistantMessage.content) || 'عذراً، صار مشكلة. جرب مرة ثانية.';

            // ── Advance flow state ──────────────────────────────────
            // flowDirective.flowState has this turn's entity merges applied;
            // advanceFlowState processes tool results and moves the step forward.
            const baseFlowState = flowDirective.mode !== 'none' ? flowDirective.flowState : null;
            const newFlowState = advanceFlowState(
                baseFlowState,
                classification.entities,
                toolsUsed,
                lastToolResults,
            );

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

            // Resolve pending_intent: if classifier found a real intent, use it.
            // 'unknown' and 'affirmation' both inherit the prior pending_intent —
            // neither represents a new topic that should overwrite conversation context.
            const isContextual = classification.intent === 'unknown' || classification.intent === 'affirmation';
            const resolvedIntent = !isContextual
                ? classification.intent
                : (convState?.pending_intent || null);

            const newTurnCount = (convState?.turn_count || 0) + 1;

            // When this turn ran search_cars, the customer is explicitly in purchase
            // mode — force pending_intent='purchase' regardless of what the classifier
            // said. This survives race conditions where a concurrent short message (like
            // "اه") would otherwise inherit a null/stale pending_intent from the DB.
            const effectiveIntent = toolsUsed.includes('search_cars') ? 'purchase' : resolvedIntent;

            try {
                // Hard 2s timeout — if conversation_states table is missing or DB is slow,
                // we must NOT let this hang for 10-12s and cause the Netlify step timeout.
                await Promise.race([
                    db.saveConversationState(phoneNumber, {
                        history,
                        pending_intent:     toolCompleted ? null : effectiveIntent,
                        collected_entities: toolCompleted ? {} : mergedEntities,
                        turn_count:         newTurnCount,
                        flow_state:         newFlowState,
                        version:            convState?.version ?? null,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('saveConversationState: 2s timeout')), 2000)
                    ),
                ]);
            } catch (e) {
                logger.warn(`⚠️ saveConversationState failed (continuing): ${e.message}`);
            }

            // ── Persist new customer facts ──────────────────────────
            // Map entity keys → customer profile columns and save anything new.
            // Fire-and-forget — never block the response on this.
            const profilePatch = {};
            if (mergedEntities.car_make)    profilePatch.car_make        = mergedEntities.car_make;
            if (mergedEntities.car_model)   profilePatch.car_model       = mergedEntities.car_model;
            if (mergedEntities.car_year)    profilePatch.car_year        = mergedEntities.car_year;
            if (mergedEntities.branch)      profilePatch.preferred_branch = mergedEntities.branch;
            if (Object.keys(profilePatch).length > 0) {
                db.updateCustomerProfile(phoneNumber, profilePatch).catch(() => {});
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
            // Before falling back to keyword matching, try the classifier's canned response.
            // classify() is <1ms and deterministic — safe to re-run in catch.
            try {
                const cls = classify(userMessage);
                if (cls.cannedResponse) {
                    logger.info(`⚡ Fallback: using classifier canned response (${cls.intent})`);
                    return {
                        response: cls.cannedResponse,
                        responseTime: Date.now() - startTime,
                        toolsUsed: [], toolCallCount: 0, escalated: false, fromCache: false,
                    };
                }
            } catch { /* ignore — proceed to keyword fallback */ }
            return this._fallbackResponse(userMessage, startTime, convState);
        }
    }

    _fallbackResponse(message, startTime, convState = null) {
        // Short answer after a bot question — don't show the generic menu.
        // If history shows the bot just asked something, the one-word reply
        // is almost certainly an answer to that question. Route them to retry.
        const lastBotMsg = convState?.history?.filter(h => h.role === 'assistant').at(-1)?.content || '';
        const isShortReply = (message || '').trim().split(/\s+/).length <= 3;
        if (isShortReply && lastBotMsg.length > 20) {
            return {
                response: 'آسف، صار عندي مشكلة بسيطة 🙏\nأعد إرسال رسالتك أو اتصل: 06-5000001',
                responseTime: Date.now() - startTime,
                toolsUsed: [], toolCallCount: 0, escalated: false, fromCache: false,
            };
        }

        // If there's an active booking flow, tell the customer their data is safe
        const flowState = convState?.flow_state;
        if (flowState?.flow_id === 'booking' && flowState.step !== 'done' && flowState.collected) {
            const c = flowState.collected;
            const parts = [
                c.service_type && `الخدمة: ${c.service_type}`,
                c.car_make     && `السيارة: ${c.car_make}${c.car_model ? ' ' + c.car_model : ''}`,
                c.date         && `التاريخ: ${c.date}`,
                c.branch       && `الفرع: ${c.branch}`,
            ].filter(Boolean).join('\n');
            return {
                response: `عذراً، تأخرنا شوي 🙏\nمعلوماتك محفوظة:\n${parts}\nبعت الرسالة مرة ثانية أو اتصل 06-5000001`,
                responseTime: Date.now() - startTime,
                toolsUsed: [], toolCallCount: 0, escalated: false, fromCache: false,
            };
        }

        const msg = (message || '').toLowerCase();
        let response;

        // Goodbye / thank-you — check first so "يسلا" doesn't fall to default menu
        if (msg.includes('يسلا') || msg.includes('يسلمو') || msg.includes('شكرا') || msg.includes('شكراً') ||
            msg.includes('باي') || msg.includes('مع السلامة') || msg.includes('موفق') || msg.includes('وداع') ||
            msg.includes('ودا')) {
            response = 'شكراً لتواصلك مع أوتو جوردن! 🚗 يسعدنا خدمتك دايماً. مع السلامة! 👋';

        // Greetings
        } else if (msg.includes('هلا') || msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('هاي') || msg.includes('اهلا')) {
            response = 'هلا والله! أهلين فيك بأوتو جوردن 🚗\nكيف بقدر أساعدك اليوم؟\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض\n5️⃣ أحكي مع موظف';

        // Promotions / offers
        } else if (msg.includes('عروض') || msg.includes('عرض') || msg.includes('تخفيض') || msg.includes('خصم') || msg.includes('اوفر')) {
            response = 'بنعمل عروض دورية على السيارات والصيانة 🎯\nاتصل: 06-5000001 أو ابعتلنا رقمك وبتواصلوا معك بآخر العروض.';

        // NOTE: check maintenance BEFORE generic "سيارة" to avoid misclassifying "صيانة للسيارة"
        } else if (msg.includes('صيانة') || msg.includes('موعد') || msg.includes('احجز') || msg.includes('حجز') || msg.includes('اصلح') || msg.includes('صلح') || msg.includes('تصليح') || msg.includes('سيرفس') || msg.includes('بنشر') || msg.includes('مبشر') || msg.includes('كوشوك') || msg.includes('عجل') || msg.includes('كفر')) {
            response = 'تكرم! 🔧 محتاج منك:\n• نوع الخدمة (صيانة / فرامل / إطارات / بنشر...)\n• ماركة السيارة وموديلها\n• الفرع (عمان/إربد/الزرقاء/العقبة)\n\nاحكيلي وبحجزلك فوراً!';

        // Branches / locations
        } else if (msg.includes('فرع') || msg.includes('فروع') || msg.includes('عنوان') || msg.includes('وين')) {
            response = 'عنا 4 أفرع 📍\n1️⃣ عمان - شارع المدينة المنورة\n2️⃣ إربد - شارع الجامعة\n3️⃣ الزرقاء - شارع الأمير محمد\n4️⃣ العقبة - شارع الملك الحسين\n\nتلفون: 06-5000001';

        // Parts
        } else if (msg.includes('قطع') || msg.includes('غيار') || msg.includes('سبير') || msg.includes('فلتر') || msg.includes('فلاتر') || msg.includes('بطارية') || msg.includes('قطعة')) {
            response = 'أكيد! 🔩 شو القطعة اللي بتحتاجها ولأي سيارة؟';

        // Support / complaint
        } else if (msg.includes('موظف') || msg.includes('حدا') || msg.includes('شكوى') || msg.includes('مدير')) {
            response = 'تكرم يا غالي 📱 تلفون: 06-5000001\nأو افتحلك تذكرة ويتواصلوا معك.';

        // Purchase — extended to match plural forms + common brands + generic "بدي" + price ranges
        } else if (msg.includes('سيارة') || msg.includes('سيارات') || msg.includes('شراء') ||
                   msg.includes('اشتري') || msg.includes('بدي') || msg.includes('للبيع') ||
                   msg.includes('تويوتا') || msg.includes('كيا') || msg.includes('هيونداي') ||
                   msg.includes('نيسان') || msg.includes('هوندا') || msg.includes('مرسيدس') ||
                   msg.includes('bmw') || msg.includes('نيتا') || msg.includes('الاف') ||
                   msg.includes('ميزانية') || msg.includes('سعر') || msg.includes('كم')) {
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
        try {
            await db.clearConversationState(phoneNumber);
        } catch (e) {
            logger.warn(`clearConversationState failed: ${e.message}`);
        }
    }

    async getHistory(phoneNumber) {
        try {
            const state = await db.getConversationState(phoneNumber);
            return state?.history || [];
        } catch {
            return [];
        }
    }
}

module.exports = new GeminiService();
