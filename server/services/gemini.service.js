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
        // LRU conversation history (Map preserves insertion order)
        this.conversationHistory = new Map();
        this.conversationLastAccess = new Map();
        // Default to 8b-instant for speed; override via env for accuracy
        this.model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
        this.maxHistory = 10;    // Last 5 turns (10 messages) — smaller = faster
        this.maxToolCalls = 4;   // Hard cap on tool round-trips
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

    async generateResponse(phoneNumber, userMessage, customerName) {
        const startTime = Date.now();

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
            if (!this.client) return this._fallbackResponse(userMessage, startTime);

            this._evictOldestIfFull();
            this.conversationHistory.set(phoneNumber, history);
            this.conversationLastAccess.set(phoneNumber, Date.now());

            history.push({ role: 'user', content: userMessage });
            while (history.length > this.maxHistory) history.shift();

            // ── Use RAG result from parallel fetch ──────────────────
            let ragContext = '';
            if (ragResult.status === 'fulfilled' && ragResult.value) {
                ragContext = ragResult.value;
                logger.info(`📚 RAG: injected ${ragContext.length} chars of context`);
            } else if (ragResult.status === 'rejected') {
                logger.warn(`⚠️ RAG failed (continuing without): ${ragResult.reason?.message}`);
            }
            // If RAG had no prevEntities context (ran in parallel before state loaded),
            // re-run only if prevEntities actually has data and RAG returned nothing.
            if (!ragContext && Object.keys(prevEntities).length > 0) {
                try {
                    const retry = await retrieveContext(classification.intent, classification.entities, prevEntities);
                    if (retry) {
                        ragContext = retry;
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

            // ── First call ──────────────────────────────────────────
            let response = await this.client.chat.completions.create({
                model: this.model,
                messages,
                tools: TOOL_DEFINITIONS,
                tool_choice: 'auto',
                max_tokens: 800,   // Reduced: 8b is concise
                temperature: 0.2,  // Lower = faster, more deterministic
            });

            let assistantMessage = response.choices[0].message;
            let toolCallCount = 0;
            const toolsUsed = [];

            // ── Tool-call loop (parallel execution per round) ───────
            while (
                assistantMessage.tool_calls?.length > 0 &&
                toolCallCount < this.maxToolCalls
            ) {
                toolCallCount++;
                messages.push(assistantMessage); // record assistant turn

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
                            content: JSON.stringify(result),
                        };
                    })
                );

                // Add all tool results to messages
                messages.push(...toolResults);

                // Get next AI response
                response = await this.client.chat.completions.create({
                    model: this.model,
                    messages,
                    tools: TOOL_DEFINITIONS,
                    tool_choice: 'auto',
                    max_tokens: 800,
                    temperature: 0.2,
                });

                assistantMessage = response.choices[0].message;
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

            return {
                response: aiText,
                responseTime,
                toolsUsed,
                toolCallCount,
                escalated: toolsUsed.includes('submit_support_ticket'),
                fromCache: false,
            };

        } catch (error) {
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
