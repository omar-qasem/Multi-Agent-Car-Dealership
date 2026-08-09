/**
 * أوتو جوردن - Fast Intent Classifier
 *
 * Pre-LLM classifier that runs in <1ms and answers two questions:
 *   1. Can we answer this with a canned response? (skips the LLM entirely)
 *   2. What entities did the user mention? (so the LLM doesn't re-extract)
 *
 * Why: Calling Groq for every "هلا" or "وين فرعكم بعمان" wastes ~1.5s
 * per message and burns tokens. Classifier handles ~30-40% of traffic.
 *
 * Returns:
 *   {
 *     intent: 'greeting' | 'faq_hours' | 'faq_branches' | 'faq_phone'
 *           | 'booking' | 'purchase' | 'support' | 'parts' | 'price'
 *           | 'unknown',
 *     confidence: 0..1,
 *     cannedResponse: string | null,    // if non-null, skip the LLM
 *     entities: {
 *       car_make?: string,
 *       car_model?: string,
 *       service_type?: string,
 *       date?: string,
 *       branch?: string,
 *       budget?: number,
 *     },
 *   }
 */

// =============================================
// Entity dictionaries & patterns — see classifier-data.js
// =============================================
const {
    CAR_MAKES,
    CAR_MODELS_AR,
    CAR_MODELS_EN,
    SERVICE_TYPES,
    BRANCH_VARIANTS,
    BRANCHES,
    CAR_COLORS,
    FUEL_TYPES,
    GREETING_PATTERNS,
    MENU_INTENT_MAP,
    GOODBYE_PATTERNS,
    AFFIRMATION_PATTERN,
    VISIT_PATTERN,
    FAQ_PATTERNS,
    INTENT_PATTERNS,
} = require('./classifier-data');

// =============================================
// Text normalization
// =============================================
// Strips Tatweel (ـ), ZWNJ, control chars, and collapses whitespace.
// Critical: WhatsApp users sometimes paste with these characters and they
// silently break substring matching.
function normalize(text) {
    if (!text) return '';
    return text
        .replace(/[\u0640]/g, '')           // Tatweel
        .replace(/[\u200B-\u200F]/g, '')    // ZWNJ, ZWJ, marks
        .replace(/[\u064B-\u0652]/g, '')    // Arabic diacritics (tashkeel)
        // Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Western Arabic (0123456789)
        .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
        // Convert Extended Arabic-Indic numerals (۰۱۲۳۴۵۶۷۸۹) — Farsi/Urdu keyboards
        .replace(/[\u06F0-\u06F9]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48))
        .replace(/\s+/g, ' ')
        .trim();
}

// =============================================
// Entity extractors
// =============================================
// Matches a keyword inside `text` using a rule appropriate for its script:
//   - Pure ASCII keywords (mg, kia, bmw, chery, toyota, etc.) require
//     non-alphanumeric boundaries on both sides so "tokia" / "smg" / "cherry"
//     don't produce false hits.
//   - Arabic keywords use substring matching because they're long enough
//     that false positives are rare, and Arabic word boundaries via \b
//     are unreliable in JS regex.
function matchesKeyword(text, keyword) {
    if (!keyword) return false;
    const isAscii = /^[A-Za-z0-9][A-Za-z0-9\s]*$/.test(keyword);
    if (isAscii) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, 'i');
        return re.test(text);
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
}

function extractCarMake(text) {
    const norm = normalize(text);
    for (const [keyword, canonical] of Object.entries(CAR_MAKES)) {
        if (matchesKeyword(norm, keyword)) return canonical;
    }
    return null;
}

function extractCarModel(text) {
    const norm = normalize(text);
    const lower = norm.toLowerCase();
    // Arabic models — substring is safe (long enough, no false positives)
    for (const model of CAR_MODELS_AR) {
        if (lower.includes(model.toLowerCase())) return model;
    }
    // ASCII models — require word boundaries to avoid matching inside other words
    for (const model of CAR_MODELS_EN) {
        const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, 'i');
        if (re.test(norm)) return model;
    }
    return null;
}

function extractServiceType(text) {
    // Substring matching with an Arabic-aware right boundary: if the char
    // immediately after the match is another Arabic letter, this is a
    // DIFFERENT word (usually a verb conjugation), not the service noun.
    // "فحصت السيارة" (I checked the car) must NOT fire "فحص شامل".
    // "بدي فحص شامل" must fire because space follows "فحص".
    // Prefix context ("ال", "بال") is intentionally not boundary-checked —
    // "الصيانة" / "بالصيانة" should both match "صيانة".
    const lower = normalize(text).toLowerCase();
    const ARABIC_LETTER = /[\u0600-\u06FF]/;
    for (const [keyword, canonical] of Object.entries(SERVICE_TYPES)) {
        const k = keyword.toLowerCase();
        const idx = lower.indexOf(k);
        if (idx === -1) continue;
        const after = lower[idx + k.length];
        if (after && ARABIC_LETTER.test(after)) {
            // Continues into another Arabic word — skip this keyword. Other
            // SERVICE_TYPES entries may still legitimately match the same
            // text (e.g. "تغيير زيت" keyword vs "زيت" alone).
            continue;
        }
        return canonical;
    }
    return null;
}

function extractBranch(text) {
    const lower = normalize(text).toLowerCase();
    // Check variants first (longer strings) then canonical names
    for (const [variant, canonical] of Object.entries(BRANCH_VARIANTS)) {
        if (lower.includes(variant.toLowerCase())) return canonical;
    }
    return null;
}

function extractDate(text) {
    // Natural-language date hints in Arabic.
    // NOTE: We avoid \b boundaries with Arabic — they don't behave reliably.
    const norm = normalize(text);
    if (/بعد\s+بكر[اةه]?/.test(norm)) return 'بعد بكرا';
    if (/اليوم/.test(norm)) return 'اليوم';
    if (/بكر[اةه]?|غد[اًا]|tomorrow/i.test(norm)) return 'بكرا';
    const dayMatch = norm.match(/(الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)/);
    if (dayMatch) return dayMatch[1];
    // ISO patterns
    const iso = norm.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    return null;
}

function extractBudget(text) {
    const norm = normalize(text);
    // Pattern A: explicit thousand marker — "15 الف", "20k", "12 ألف"
    // NOTE: \b doesn't work after Arabic chars in JS. Use lookahead instead.
    const withMarker = norm.match(/(\d{1,3}(?:[\s,]?\d{3})?)\s*(?:الف|ألف|آلاف|k(?=[^a-z]|$))/i);
    if (withMarker) {
        let n = parseInt(withMarker[1].replace(/[\s,]/g, ''), 10);
        if (n < 1000) n *= 1000;
        if (n >= 1000 && n <= 1000000) return n;
    }
    // Pattern B: standalone large number near budget context — "ميزانيتي 12000"
    const ctxPatterns = [
        /(?:ميزاني[تة]ي?|ميزانية|بحدود|على\s+حدود|تحت|اقل\s+من|أقل\s+من|حوالي|تقريبا)\s*(\d{4,6})/i,
        /(\d{4,6})\s*(?:دينار|jod|دك)/i,
    ];
    for (const re of ctxPatterns) {
        const m = norm.match(re);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 1000 && n <= 1000000) return n;
        }
    }
    return null;
}

function extractFuelType(text) {
    const lower = normalize(text).toLowerCase();
    for (const [keyword, canonical] of Object.entries(FUEL_TYPES)) {
        if (lower.includes(keyword.toLowerCase())) return canonical;
    }
    return null;
}

function extractCondition(text) {
    const norm = normalize(text);
    if (/جديد[ةه]?|new\s+car/i.test(norm))      return 'new';
    if (/مستعمل[ةه]?|used\s+car|سكند\s+هاند|second\s*hand/i.test(norm)) return 'used';
    return null;
}

function extractColor(text) {
    const lower = normalize(text).toLowerCase();
    for (const [keyword, canonical] of Object.entries(CAR_COLORS)) {
        if (matchesKeyword(lower, keyword.toLowerCase())) return canonical;
    }
    return null;
}

// Helper: returns true if any strong intent keyword is present.
function hasStrongIntentKeyword(text) {
    for (const re of Object.values(INTENT_PATTERNS)) {
        if (re.test(text)) return true;
    }
    return false;
}

// Helper: returns true if a regex match is in a negated context.
// We scan the preamble for a negation particle (ما / مش / مو / لا) that
// sits within the same clause as the matched verb. Up to three filler
// tokens are allowed between the negation and the verb so that
// "والله ما كنت بدي احجز" (I truly didn't want to book) is caught, but
// a distant negation in a prior clause is not.
//
// Clause boundary: the nearest sentence punctuation (،.!?؟) before the
// match, or the start of the string. The negation must live inside that
// slice. Connector "و" is NOT a clause boundary because it appears too
// often inside a single thought ("والله").
function isNegated(text, matchIndex) {
    if (matchIndex == null || matchIndex < 0) return false;
    const fullBefore = text.slice(0, matchIndex);
    // Take the last clause only.
    const punctIdx = Math.max(
        fullBefore.lastIndexOf('،'),
        fullBefore.lastIndexOf('.'),
        fullBefore.lastIndexOf('!'),
        fullBefore.lastIndexOf('?'),
        fullBefore.lastIndexOf('؟'),
    );
    const clause = punctIdx >= 0 ? fullBefore.slice(punctIdx + 1) : fullBefore;
    // Negation particle followed by 0..3 filler tokens, then run to end.
    return /(?:^|[\s،,.!?؟])(?:ما|مش|مو|لا)(?:\s+\S+){0,3}\s+$/.test(clause);
}

// =============================================
// Main classifier
// =============================================
function classify(text) {
    const empty = {
        intent: 'unknown',
        confidence: 0,
        cannedResponse: null,
        entities: {},
    };

    if (!text || typeof text !== 'string') return empty;
    const norm = normalize(text);
    if (!norm) return empty;

    // 0a. Numeric menu selection — "1" / "2" / "3" / "4" / "5" after greeting menu.
    //     Must be a very short message consisting of just the digit (optionally
    //     surrounded by punctuation/emoji) so "3 سيارات" still goes to the LLM.
    const trimmedNorm = norm.replace(/[^\d]/g, '');
    if (trimmedNorm.length === 1 && norm.replace(/[\s!?.،؟]/g, '').length <= 3) {
        const menuIntent = MENU_INTENT_MAP[trimmedNorm];
        if (menuIntent) {
            const MENU_RESPONSES = {
                purchase:   'أهلين! 🚗 ابحث عن سيارة — شو الماركة اللي بتفضلها وميزانيتك؟',
                parts:      'أكيد! 🔩 شو القطعة اللي بتحتاجها ولأي سيارة؟',
                booking:    'تكرم! 🔧 بدي احجزلك موعد صيانة.\nشو نوع الخدمة؟ (صيانة دورية / فرامل / مكيف / غيرها)',
                promotions: null, // let LLM call get_promotions for live data
                support:    'تكرم يا غالي 📱 شو المشكلة أو الطلب؟ وبتصل بك أحد موظفينا.',
            };
            const canned = MENU_RESPONSES[menuIntent];
            return {
                intent: menuIntent,
                confidence: 0.95,
                cannedResponse: canned,
                entities: {},
            };
        }
    }

    // 0b. Goodbye / thank-you — short farewell, no LLM needed.
    if (GOODBYE_PATTERNS.test(norm) && norm.length < 40) {
        return {
            intent: 'goodbye',
            confidence: 0.95,
            cannedResponse: 'شكراً لتواصلك مع أوتو جوردن! 🚗 يسعدنا خدمتك دايماً. مع السلامة! 👋',
            entities: {},
        };
    }

    // Always extract entities — useful even when intent is unclear
    const entities = {};
    const make      = extractCarMake(norm);      if (make)      entities.car_make    = make;
    const model     = extractCarModel(norm);     if (model)     entities.car_model   = model;
    const service   = extractServiceType(norm);  if (service)   entities.service_type = service;
    const branch    = extractBranch(norm);       if (branch)    entities.branch      = branch;
    const date      = extractDate(norm);         if (date)      entities.date        = date;
    const budget    = extractBudget(norm);       if (budget)    entities.budget      = budget;
    const fuel      = extractFuelType(norm);     if (fuel)      entities.fuel_type   = fuel;
    const condition = extractCondition(norm);    if (condition) entities.condition   = condition;
    const color     = extractColor(norm);        if (color)     entities.color       = color;
    if (VISIT_PATTERN.test(norm))                               entities.wants_visit = true;

    // Pre-compute compound-query guards so greeting/FAQ don't hijack a
    // message that also carries a real question or intent.
    const matchesAnyFaq = FAQ_PATTERNS.some(f => f.regex.test(norm));
    const hasStrongIntent = hasStrongIntentKeyword(norm);

    // 0c. Short affirmation — "اه", "نعم", "أكيد", "تمام", "ok", etc.
    // These are CONTEXT-DEPENDENT — the LLM must use the prior conversation to
    // interpret them correctly. We tag them 'affirmation' so:
    //   a) they never corrupt pending_intent (treated like 'unknown' for intent resolution)
    //   b) the classifierHint explicitly tells the LLM "customer is saying yes"
    // Guard: skip if a strong intent keyword is also present ("أكيد بدي احجز"
    // should stay 'booking', not 'affirmation').
    if (AFFIRMATION_PATTERN.test(norm) && norm.length < 25 && !hasStrongIntent) {
        return {
            intent: 'affirmation',
            confidence: 0.9,
            cannedResponse: null,
            entities,
        };
    }

    // 1. Greetings — very high confidence canned response.
    //    Guards: short message AND no strong intent keyword AND no FAQ
    //    pattern AND no extracted service/date/budget present.
    //    Otherwise "مرحبا شو رقم تلفونكم" or "هلا بدي احجز صيانة" would be
    //    hijacked by the greeting menu.
    if (
        GREETING_PATTERNS.test(norm) &&
        norm.length < 25 &&
        !hasStrongIntent &&
        !matchesAnyFaq &&
        !service && !date && !budget
    ) {
        return {
            intent: 'greeting',
            confidence: 0.99,
            cannedResponse:
                'هلا والله! أهلين فيك بأوتو جوردن 🚗\n' +
                'كيف بقدر أساعدك اليوم؟\n\n' +
                '1️⃣ سيارات للبيع\n' +
                '2️⃣ قطع غيار\n' +
                '3️⃣ حجز صيانة\n' +
                '4️⃣ عروض حالية\n' +
                '5️⃣ أحكي مع موظف',
            entities,
        };
    }

    // 2. FAQ — high confidence canned response, BUT only when there's no
    //    competing strong intent in the same message. "شو ساعات دوامكم
    //    وبدي احجز صيانة" matches faq_hours and booking simultaneously —
    //    we should let the LLM handle it so the booking isn't dropped.
    if (!hasStrongIntent) {
        for (const faq of FAQ_PATTERNS) {
            if (faq.regex.test(norm)) {
                return {
                    intent: faq.intent,
                    confidence: 0.95,
                    cannedResponse: faq.response,
                    entities,
                };
            }
        }
    }

    // 2.5. Showroom visit — customer wants to come in person to see a car.
    // Must fire before generic strong-intent patterns so "بدي اجي اشوف" isn't
    // misread as a booking or purchase request.
    const visitMatch = VISIT_PATTERN.exec(norm);
    if (visitMatch && !isNegated(norm, visitMatch.index)) {
        entities.wants_visit = true;
        return {
            intent: 'visit',
            confidence: 0.88,
            cannedResponse: null,
            entities,
        };
    }

    // 3. Strong intent keywords — DON'T skip the LLM, but tag the intent
    //    so downstream code can validate / route correctly.
    //    Negation aware: "ما بدي احجز" must NOT fire booking intent.
    for (const [intent, regex] of Object.entries(INTENT_PATTERNS)) {
        const m = regex.exec(norm);
        if (m && !isNegated(norm, m.index)) {
            return {
                intent,
                confidence: 0.85,
                cannedResponse: null,
                entities,
            };
        }
    }

    // 4. Inferred booking: service_type + date but no explicit "بدي احجز".
    //    Example: "تغيير زيت بكرا الساعة 10". Strong enough signal.
    if (service && date) {
        return {
            intent: 'booking',
            confidence: 0.75,
            cannedResponse: null,
            entities,
        };
    }

    // 5. No strong signal — let the LLM handle it
    return { intent: 'unknown', confidence: 0, cannedResponse: null, entities };
}

module.exports = {
    classify,
    normalize,
    extractCarMake,
    extractCarModel,
    extractServiceType,
    extractBranch,
    extractDate,
    extractBudget,
    extractFuelType,
    extractCondition,
};
