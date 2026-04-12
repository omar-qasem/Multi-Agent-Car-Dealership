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
const SYSTEM_PROMPT = `أنت "أبو الزوز" 🚗 مساعد أوتو جوردن للسيارات - بتحكي بلهجة أردنية ودية مختصرة.

## الأدوات — قواعد صارمة:
- سعر / توفر سيارة → search_cars أو check_availability (لا تخمّن الأسعار!)
- قطعة غيار (بريك/فلتر/بطارية/إطار/زيت/شمعات) → check_parts_inventory
- حجز صيانة → book_maintenance (تأكيد فقط بعد رجوع booking_id)
- مقارنة سيارتين → compare_cars
- تقسيط / قسط → calculate_financing
- اهتمام بشراء → create_purchase_inquiry
- يبدو غاضب / يطلب موظف → submit_support_ticket

**ممنوع تخمين سعر أو تأكيد حجز.** إذا في "بيانات من المخزون" أدناه، اعتمد عليها مباشرة. إذا ما في، استدعِ الأداة أولاً.

## قاعدة تدفّق النوايا — حاسمة:
- بمجرد ما تتحدد النية (حجز/شراء/استفسار) **لا تغيّر الموضوع أبداً** حتى لو المعلومات ناقصة.
- حجز الصيانة ≠ استفسار شراء. ممنوع السؤال عن "أنواع السيارات المتوفرة" ردًا على طلب حجز.
- إذا معلومة ناقصة: اسأل عنها مباشرة، سؤال واحد فقط في الرسالة.
- ترتيب جمع معلومات الحجز: نوع الخدمة → ماركة وموديل السيارة → التاريخ والوقت → الفرع → الاسم.
- إذا توفّر service_type + preferred_date: استدعِ book_maintenance فوراً حتى لو باقي الحقول ناقصة — النظام يعالجها.
- إذا رجع missing_info من الأداة: أكّد الحجز أولاً ثم اطلب المعلومات الناقصة لتحديثها.

## ردودك:
- مختصرة ومفيدة، بدون مقدمات
- إيموجي خفيف (🚗 🔧 ✅ 💰)
- إذا الأداة رجعت خطأ: "واجهنا مشكلة بسيطة، اتصل 06-5000001"

## معلومات أوتو جوردن:
- عمان، شارع المدينة المنورة | 06-5000001
- 4 أفرع: عمان، إربد، الزرقاء، العقبة
- ساعات: أسبوع 8ص-8م | جمعة 8ص-2م | سبت 8ص-6م
- ماركات: Toyota, Hyundai, Kia, MG, Chery, Nissan, BMW
- دفع: كاش، بطاقة، تحويل، تقسيط`;

// =============================================
// AI Service Class
// =============================================
class GeminiService {
    constructor() {
        this.client = null;
        this.conversationHistory = new Map();
        this.conversationLastAccess = new Map();
        // llama-3.3-70b-versatile: reliable Arabic function calling
        // llama-3.1-8b-instant: fast but generates malformed <function=...> tool calls
        this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
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

    /**
     * Low-level Groq API call with:
     * - AbortSignal support (pass the generateResponse-level controller)
     * - Retry once on 429 (wait up to 3s) or connection errors
     */
    async _callGroq(params, signal) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await this.client.chat.completions.create(params, { signal });
            } catch (err) {
                // AbortError → outer timeout fired, stop immediately
                if (err?.name === 'AbortError' || signal?.aborted) throw err;

                const status = err?.status || err?.statusCode;

                // 429 Rate limit — wait up to 3s then retry once
                if (status === 429 && attempt < 2) {
                    const waitMs = Math.min(this._parseRetryAfterMs(err?.message), 3000);
                    logger.warn(`⚠️ Groq rate limit (429) — waiting ${waitMs}ms before retry`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                // Connection error — retry once immediately
                if ((err?.message?.toLowerCase().includes('connection') || err?.message?.toLowerCase().includes('network')) && attempt < 2) {
                    logger.warn(`⚠️ Groq connection error — retrying immediately`);
                    continue;
                }

                throw err;
            }
        }
    }

    /** Extract retry-after seconds from Groq 429 error message */
    _parseRetryAfterMs(message = '') {
        const m = message.match(/try again in (\d+(?:\.\d+)?)s/);
        return m ? Math.ceil(parseFloat(m[1])) * 1000 : 2000;
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
                case 'book_maintenance': {
                    if (r.booking_id || r.id) {
                        return `✅ تم حجز موعد الصيانة بنجاح!\n📋 رقم الحجز: ${r.booking_id || r.id}\n\nسنتواصل معك للتأكيد. للاستفسار: 06-5000001`;
                    }
                    if (r.missing_info) return `بحتاج منك معلومة واحدة: ${r.missing_info} 🙏`;
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
                default:
                    return null; // no template for this tool — let outer fallback handle it
            }
        } catch {
            return null;
        }
    }

    async generateResponse(phoneNumber, userMessage, customerName) {
        const startTime = Date.now();

        // AbortController — cancels in-flight Groq HTTP requests when our budget runs out.
        // Prevents timed-out calls from running 100+ seconds in the background (consuming
        // Groq TPM quota and causing rate-limit cascades on the next request).
        // Budget = 18s (2s below the outer 20s step timeout).
        const abortController = new AbortController();
        const abortTimer = setTimeout(() => {
            logger.warn('⏱️ generateResponse: 18s budget exhausted — aborting Groq request');
            abortController.abort();
        }, 18000);

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
                    await db.saveConversationState(phoneNumber, {
                        history,
                        pending_intent:     convState?.pending_intent || null,
                        collected_entities: mergedEntities,
                        turn_count:         (convState?.turn_count || 0) + 1,
                    });
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
            const MAX_RAG_CHARS = 400; // Cap tokens — free tier is tight (6k TPM)
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

            const systemNote = customerName
                ? `${SYSTEM_PROMPT}${ragContext}${classifierHint}\nالعميل: ${customerName} | رقمه: ${phoneNumber}`
                : `${SYSTEM_PROMPT}${ragContext}${classifierHint}\nرقم العميل: ${phoneNumber}`;

            const messages = [
                { role: 'system', content: systemNote },
                ...history
            ];

            const llmParams = {
                model: this.model,
                tools: TOOL_DEFINITIONS,
                tool_choice: 'auto',
                max_tokens: 600,  // Reduced from 800 — saves TPM quota
                temperature: 0.2,
            };

            // ── First LLM call ──────────────────────────────────────
            let response = await this._callGroq({ ...llmParams, messages }, abortController.signal);

            let assistantMessage = response.choices[0].message;
            let toolCallCount = 0;
            const toolsUsed = [];
            let lastToolResults = []; // kept for graceful degradation if LLM2 fails

            // ── Tool-call loop (parallel execution per round) ───────
            while (
                assistantMessage.tool_calls?.length > 0 &&
                toolCallCount < this.maxToolCalls
            ) {
                toolCallCount++;
                messages.push(assistantMessage);

                // ⚡ Execute ALL tool calls in this round in PARALLEL
                const toolResults = await Promise.all(
                    assistantMessage.tool_calls.map(async (toolCall) => {
                        const toolName = toolCall.function.name;
                        let toolArgs = {};
                        try {
                            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                        } catch {
                            logger.warn('⚠️ فشل parse لأرجومنت الأداة:', toolCall.function.arguments);
                        }
                        logger.info(`🔧 Tool #${toolCallCount}: ${toolName}`);
                        toolsUsed.push(toolName);
                        const result = await executeTool(toolName, toolArgs, phoneNumber);
                        return {
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolName,  // extra field — used by formatToolFallback
                            content: JSON.stringify(result),
                        };
                    })
                );
                lastToolResults = toolResults;
                messages.push(...toolResults);

                // ── LLM2: Generate response after tool execution ─────
                // If this call times out/fails, use _formatToolFallback to build
                // an Arabic response from the tool result so the user isn't left
                // with a generic error even though their action succeeded.
                let llm2Failed = false;
                try {
                    response = await this._callGroq({ ...llmParams, messages }, abortController.signal);
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
                await db.saveConversationState(phoneNumber, {
                    history,
                    pending_intent:     toolCompleted ? null : resolvedIntent,
                    collected_entities: toolCompleted ? {} : mergedEntities,
                    turn_count:         newTurnCount,
                });
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

        if (msg.includes('هلا') || msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('هاي')) {
            response = 'هلا والله! أهلين فيك بأوتو جوردن 🚗\nكيف بقدر أساعدك اليوم؟\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض\n5️⃣ أحكي مع موظف';
        } else if (msg.includes('سيارة') || msg.includes('شراء')) {
            response = 'أهلين! عنا سيارات جديدة ومستعملة 🚗\nشو الماركة اللي بتفضلها وميزانيتك؟';
        } else if (msg.includes('صيانة') || msg.includes('موعد')) {
            response = 'تكرم! 🔧 محتاج منك: نوع سيارتك، الخدمة المطلوبة، والفرع (عمان/إربد/الزرقاء/العقبة)';
        } else if (msg.includes('قطع') || msg.includes('غيار')) {
            response = 'أكيد! شو القطعة ولأي سيارة؟ 🔩';
        } else if (msg.includes('موظف') || msg.includes('حدا')) {
            response = 'تكرم يا غالي 📱 تلفون: 06-5000001\nأو افتحلك تذكرة ويتواصلوا معك.';
        } else {
            response = 'أهلين بأوتو جوردن! 🚗\n\n1️⃣ سيارات\n2️⃣ قطع غيار\n3️⃣ صيانة\n4️⃣ عروض\n5️⃣ موظف\n\nاختار أو احكيلي شو بتحتاج!';
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
