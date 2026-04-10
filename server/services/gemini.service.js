/**
 * أوتو جوردن - AI Service with Agent Tools
 * Groq API with function calling for car dealership
 */

const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { TOOL_DEFINITIONS, executeTool } = require('./agent-tools');

// =============================================
// System Prompt - بالنكهة الأردنية
// =============================================

const SYSTEM_PROMPT = `أنت "أبو الزوز" 🚗 - المساعد الذكي لمعرض أوتو جوردن للسيارات.

## شخصيتك:
- بتحكي باللهجة الأردنية الطبيعية والودية
- كلمات أردنية: هلا، كيفك، إن شاء الله، يا هلا، تكرم، ما يقصر، أهلين، عالراس والعين
- محترف بس قريب من الناس — ما بتستخدم فصحى أو لهجة مصرية أو خليجية

## ⚠️ قاعدة حاسمة — استخدم الأدوات إجبارياً:
**ممنوع نهائياً ترد على أي سؤال عن سعر، توفر، قطعة غيار، أو حجز من دون استدعاء الأداة المناسبة أولاً.**
- العميل سأل عن سعر أو موصفات سيارة → **لازم** تستدعي search_cars أولاً وترجع الأرقام الدقيقة من النتيجة
- العميل سأل عن قطعة غيار (بريك، فلتر، بطارية، إطار، شمعات، زيت، سفايف، ديسكات) → **لازم** تستدعي check_parts_inventory
- العميل بدو يحجز صيانة → **لازم** تستدعي book_maintenance وتنتظر النتيجة قبل ما تأكد الحجز

**ممنوع إعطاء أسعار أو تأكيد حجوزات أو ادعاء توفر بدون أن تحصل على الجواب من الأداة.** إذا الأداة رجعت خطأ — أخبر العميل بصراحة.

## تحديد النية (Intent) — قواعد صارمة:
هاي الكلمات تعني **قطع غيار** وليست سيارات:
- بريك، بريك باد، سفايف، ديسكات، فلتر، بطارية، إطار، إطارات، زيت، شمعات، رديتر، كلتش، جير بوكس
- أي سؤال فيه "عندكم" + اسم قطعة = check_parts_inventory

هاي الكلمات تعني **سيارة**:
- كامري، توسان، سبورتاج، كورولا، سوناتا، سيارة، موديل

هاي الكلمات تعني **صيانة/حجز**:
- صيانة، تغيير زيت، حجز، موعد، فحص

## طريقة التعامل — الأولوية الأعلى أولاً:
1. "كم سعر X؟" أو "شو سعر X؟" → search_cars → اعرض السعر الدقيق من النتيجة
2. "عندكم X؟" + اسم قطعة (بريك/فلتر/بطارية/إطار) → check_parts_inventory → اعرض التوفر والسعر
3. "عندكم X؟" + اسم سيارة → check_availability → اعرض العدد والألوان والأفرع
4. "بدي أحجز" / "حجز صيانة" → اسأل التفاصيل الناقصة → book_maintenance → أكد فقط إذا الأداة رجعت success
5. "قارنلي X و Y" → compare_cars
6. "كم القسط؟" / "تقسيط" → calculate_financing
7. "بدي أحكي مع حدا" / "موظف" → submit_support_ticket
8. العميل أبدى اهتمام حقيقي بشراء سيارة → create_purchase_inquiry

## قاعدة الحجز — مهمة جداً:
- ما تقول "تم الحجز" إلا إذا أداة book_maintenance رجعت booking_id
- إذا الأداة رجعت خطأ → قول: "واجهنا مشكلة بسيطة، خليني أحولك لأحد الشباب"
- قبل الحجز اسأل: اسم العميل، نوع السيارة، نوع الخدمة، التاريخ، الفرع

## تنسيق الرسائل:
- إيموجي معتدل (🚗 🔧 ✅ 📱 📍 💰)
- معلومات مرتبة وواضحة
- ما ترسل رسائل طويلة — قسمها لنقاط
- عدة خيارات → اعرضها بأرقام

## معلومات الشركة:
- أوتو جوردن (Auto Jordan) — عمان، شارع المدينة المنورة
- تلفون: 06-5000001 | واتساب: 962790000001
- 4 أفرع: عمان (الرئيسي)، إربد، الزرقاء، العقبة
- ساعات: أسبوع 8ص-8م (عمان)/8ص-7م (باقي) | جمعة 8ص-2م | سبت 8ص-6م/5م
- ماركات: Toyota, Hyundai, Kia, MG, Chery, Nissan, BMW
- دفع: كاش، بطاقة، تحويل بنكي، تقسيط

تذكر: كل رد يحتوي على بيانات (سعر/توفر/حجز) **لازم** يمر عبر الأداة أولاً. ما تخمن أبداً! 🚗✨`;

// =============================================
// AI Service Class
// =============================================

class GeminiService {
    constructor() {
        this.client = null;
        // LRU-like conversation history using Map (insertion order = recency)
        this.conversationHistory = new Map();
        this.conversationLastAccess = new Map(); // phone → timestamp
        this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        this.maxHistory = 20;
        this.maxToolCalls = 5;
        this.MAX_CUSTOMERS = parseInt(process.env.MAX_CONVERSATION_CUSTOMERS) || 10000;
        this.CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
        this._initialize();
        this._startCleanupTimer();
    }

    _startCleanupTimer() {
        // Skip periodic cleanup in serverless environments (no persistent process)
        if (process.env.NETLIFY) return;
        // Cleanup stale conversations every hour
        this._cleanupInterval = setInterval(() => this._cleanupStaleConversations(), 60 * 60 * 1000);
        if (this._cleanupInterval.unref) this._cleanupInterval.unref();
    }

    _cleanupStaleConversations() {
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
        // If exceeding MAX_CUSTOMERS, evict oldest (first-inserted) entry — LRU via Map order
        while (this.conversationHistory.size >= this.MAX_CUSTOMERS) {
            const oldestKey = this.conversationHistory.keys().next().value;
            if (oldestKey === undefined) break;
            this.conversationHistory.delete(oldestKey);
            this.conversationLastAccess.delete(oldestKey);
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
            logger.success(`✅ تم تهيئة Groq AI بنجاح - Model: ${this.model}`);
        } catch (error) {
            logger.error('❌ خطأ في تهيئة Groq AI:', error);
        }
    }

    async generateResponse(phoneNumber, userMessage, customerName) {
        const startTime = Date.now();

        try {
            if (!this.client) return this._fallbackResponse(userMessage, startTime);

            // Get or initialize conversation history (with LRU eviction)
            if (!this.conversationHistory.has(phoneNumber)) {
                this._evictOldestIfFull();
                this.conversationHistory.set(phoneNumber, []);
            } else {
                // Touch: move to end of Map for LRU-style recency tracking
                const existing = this.conversationHistory.get(phoneNumber);
                this.conversationHistory.delete(phoneNumber);
                this.conversationHistory.set(phoneNumber, existing);
            }
            this.conversationLastAccess.set(phoneNumber, Date.now());
            const history = this.conversationHistory.get(phoneNumber);

            // Add user message to history
            history.push({ role: 'user', content: userMessage });

            // Keep only last N messages
            while (history.length > this.maxHistory) {
                history.shift();
            }

            // Build messages array
            const contextNote = customerName ? `\n\nاسم العميل الحالي: ${customerName}` : '';
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT + contextNote + `\nرقم العميل: ${phoneNumber}` },
                ...history
            ];

            // First API call with tools
            let response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                tools: TOOL_DEFINITIONS,
                tool_choice: 'auto',
                max_tokens: 1500,
                temperature: 0.3,
            });

            let assistantMessage = response.choices[0].message;
            let toolCallCount = 0;
            const toolsUsed = [];

            // Handle tool calls iteratively
            while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && toolCallCount < this.maxToolCalls) {
                toolCallCount++;

                // Add assistant message with tool calls to messages
                messages.push(assistantMessage);

                // Execute each tool call
                for (const toolCall of assistantMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    let toolArgs = {};
                    try {
                        toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                    } catch (e) {
                        logger.warn('⚠️ Failed to parse tool args:', toolCall.function.arguments);
                    }

                    logger.info(`🔧 Tool call #${toolCallCount}: ${toolName}`, { args: toolArgs });
                    toolsUsed.push(toolName);

                    // Execute the tool
                    const toolResult = await executeTool(toolName, toolArgs, phoneNumber);

                    // Add tool result to messages
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(toolResult)
                    });
                }

                // Get next response
                response = await this.client.chat.completions.create({
                    model: this.model,
                    messages: messages,
                    tools: TOOL_DEFINITIONS,
                    tool_choice: 'auto',
                    max_tokens: 1500,
                    temperature: 0.3,
                });

                assistantMessage = response.choices[0].message;
            }

            const aiText = assistantMessage.content || 'عذراً، صار مشكلة. جرب مرة ثانية.';

            // Add AI response to history
            history.push({ role: 'assistant', content: aiText });

            const responseTime = Date.now() - startTime;
            logger.info(`✅ AI Response: ${responseTime}ms | Tools: ${toolCallCount} calls [${toolsUsed.join(', ')}]`);

            return {
                response: aiText,
                responseTime,
                toolsUsed,
                toolCallCount,
                escalated: toolsUsed.includes('submit_support_ticket'),
                fromCache: false
            };

        } catch (error) {
            logger.error('❌ AI Service Error:', error.message);
            return this._fallbackResponse(userMessage, startTime);
        }
    }

    _fallbackResponse(message, startTime) {
        const msg = (message || '').toLowerCase();
        let response;

        if (msg.includes('هلا') || msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('هاي')) {
            response = 'هلا والله! أهلين فيك بأوتو جوردن 🚗\nكيف بقدر أساعدك اليوم؟\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض وتخفيضات\n5️⃣ أحكي مع موظف';
        } else if (msg.includes('سيارة') || msg.includes('سيارات') || msg.includes('شراء')) {
            response = 'أهلين! عنا تشكيلة واسعة من السيارات الجديدة والمستعملة 🚗\nشو الماركة اللي بتفضلها؟ وشو ميزانيتك التقريبية؟';
        } else if (msg.includes('صيانة') || msg.includes('تصليح') || msg.includes('موعد')) {
            response = 'تكرم! بدك تحجز موعد صيانة؟ 🔧\nمحتاج منك:\n- نوع سيارتك\n- شو المشكلة أو الخدمة المطلوبة\n- الفرع اللي بتفضله (عمان/إربد/الزرقاء/العقبة)';
        } else if (msg.includes('قطع') || msg.includes('غيار') || msg.includes('قطعة')) {
            response = 'أكيد! شو القطعة اللي بتدور عليها؟ 🔩\nولأي نوع سيارة؟';
        } else if (msg.includes('موظف') || msg.includes('بشري') || msg.includes('حدا') || msg.includes('شخص')) {
            response = 'أكيد يا غالي! رح أوصلك بأحد الشباب حالاً 📱\nتلفون الفرع الرئيسي: 06-5000001\nأو ممكن أفتحلك تذكرة ويتواصلوا معك هم.';
        } else {
            response = 'أهلين فيك بأوتو جوردن! 🚗\nواجهنا مشكلة تقنية بسيطة، بس خليني أساعدك:\n\n1️⃣ سيارات للبيع\n2️⃣ قطع غيار\n3️⃣ حجز صيانة\n4️⃣ عروض وتخفيضات\n5️⃣ أحكي مع موظف\n\nاختار رقم أو احكيلي شو بتحتاج!';
        }

        return {
            response,
            responseTime: Date.now() - startTime,
            toolsUsed: [],
            toolCallCount: 0,
            escalated: false,
            fromCache: false
        };
    }

    clearHistory(phoneNumber) {
        this.conversationHistory.delete(phoneNumber);
    }

    getHistory(phoneNumber) {
        return this.conversationHistory.get(phoneNumber) || [];
    }
}

module.exports = new GeminiService();
