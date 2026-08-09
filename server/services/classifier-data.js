/**
 * أوتو جوردن - Classifier dictionaries & patterns
 *
 * Pure data used by classifier.js: entity dictionaries (car makes/models,
 * service types, branches, colors, fuel types) and the regex patterns for
 * greetings/FAQ/intent detection. Split out from classifier.js so the
 * matching logic isn't buried under ~270 lines of lookup tables.
 */

// =============================================
// Canonical entity dictionaries
// =============================================
// Car makes keyed by every common Jordanian-Arabic spelling we've seen
// in production WhatsApp logs. Canonical brand names use English.
// NOTE: single-و "تيوتا" and ط-variants ("طويوطا") appear often — they
// must all map to Toyota or the classifier leaks entities, which in
// turn forces the LLM into broader (and slower) tool-calling.
const CAR_MAKES = {
    // Toyota — standard + common Jordanian misspellings
    'تويوتا': 'Toyota', 'تيوتا': 'Toyota', 'طويوطا': 'Toyota',
    'تويوطا': 'Toyota', 'طويوتا': 'Toyota', 'toyota': 'Toyota',
    // Hyundai — multiple transliterations land in WhatsApp
    'هيونداي': 'Hyundai', 'هيوندا': 'Hyundai', 'هيوندي': 'Hyundai',
    'هيونداى': 'Hyundai', 'hyundai': 'Hyundai',
    // Kia — short, but matchesKeyword() enforces boundary on ASCII
    'كيا': 'Kia', 'kia': 'Kia',
    // Nissan
    'نيسان': 'Nissan', 'نسان': 'Nissan', 'nissan': 'Nissan',
    // MG
    'mg': 'MG', 'ام جي': 'MG', 'إم جي': 'MG',
    // Chery
    'شيري': 'Chery', 'جيري': 'Chery', 'chery': 'Chery',
    // BMW
    'بي ام': 'BMW', 'بي ام دبليو': 'BMW', 'bmw': 'BMW',
    // Neta (Hozon) — Chinese EV brand increasingly common in Jordan
    'نيتا': 'Neta', 'نيتو': 'Neta', 'neta': 'Neta',
    // BYD — Chinese EV brand
    'بي واي دي': 'BYD', 'byd': 'BYD',
    // Geely
    'جيلي': 'Geely', 'geely': 'Geely',
    // Audi — very common in Jordan, not sold by dealer but serviced
    'أودي': 'Audi', 'اودي': 'Audi', 'آودي': 'Audi', 'audi': 'Audi',
    // Mercedes — same: common for service requests
    'مرسيدس': 'Mercedes', 'مرسدس': 'Mercedes', 'mercedes': 'Mercedes',
    // Honda
    'هوندا': 'Honda', 'honda': 'Honda',
    // Mitsubishi
    'ميتسوبيشي': 'Mitsubishi', 'ميتسوبيشى': 'Mitsubishi', 'mitsubishi': 'Mitsubishi',
    // Suzuki
    'سوزوكي': 'Suzuki', 'suzuki': 'Suzuki',
    // Volkswagen
    'فولكسفاغن': 'Volkswagen', 'فولكس': 'Volkswagen', 'vw': 'Volkswagen',
};

// Two lists: Arabic models (substring-safe because they're long) and
// short ASCII models that need word-boundary matching to avoid false hits
// inside unrelated text.
const CAR_MODELS_AR = [
    'كامري', 'كورولا', 'لاندكروزر', 'راف فور',
    'توسان', 'النترا', 'سانتافي',
    'سبورتاج', 'سيراتو',
    'سني', 'التيما',
    'تيجو',
];
const CAR_MODELS_EN = [
    'Camry', 'Corolla', 'Land Cruiser', 'RAV4',
    'Tucson', 'Elantra', 'Santa Fe',
    'Sportage', 'Cerato',
    'Sunny', 'Altima',
    '320i', 'Tiggo', 'ZS', 'HS',
    // Neta models
    'YU', 'Neta V', 'Neta GT',
];

const SERVICE_TYPES = {
    'صيانة': 'صيانة دورية',
    'سيرفس': 'صيانة دورية',
    'تغيير زيت': 'تغيير زيت',
    'تغيير الزيت': 'تغيير زيت',
    'غيار زيت': 'تغيير زيت',    // colloquial: "oil change"
    'غيار الزيت': 'تغيير زيت',
    'اغير زيت': 'تغيير زيت',    // verb form: "change oil"
    'أغير زيت': 'تغيير زيت',
    'غير الزيت': 'تغيير زيت',
    'فحص': 'فحص شامل',
    'برمجة': 'برمجة',
    'كهرباء': 'كهرباء',
    'ميكانيك': 'ميكانيك',
    'سمكرة': 'سمكرة ودهان',
    'دهان': 'سمكرة ودهان',
    'مكيف': 'صيانة مكيف',
    'فرامل': 'فرامل',
    'بريك': 'فرامل',
    'بركات': 'فرامل',   // Jordanian dialect for brakes
    'اطارات': 'اطارات',
    'طايرات': 'اطارات',
    'إطارات': 'اطارات',
    'كوشوك': 'اطارات',
    'كفر': 'اطارات',
    'عجل': 'اطارات',
    'بنشر': 'إصلاح بنشر',
    'بنچر': 'إصلاح بنشر',
    'مبشر': 'إصلاح بنشر',
    'ثقب': 'إصلاح بنشر',
    'فردة': 'إصلاح بنشر',
    'اقزوزت': 'عادم',
    'عادم': 'عادم',
    'كاتالست': 'عادم',
    'بطارية': 'بطارية',
    'تشريب': 'تشريب',
    'تبديل زجاج': 'زجاج',
    'زجاج': 'زجاج',
    'تظليل': 'تظليل شبابيك',
    'ظلل': 'تظليل شبابيك',
    'اظلل': 'تظليل شبابيك',
    'تظليل شبابيك': 'تظليل شبابيك',
    'شبابيك': 'تظليل شبابيك',
    'فيلم شبابيك': 'تظليل شبابيك',
    'ناقل حركة': 'ناقل حركة',
    'فيتة': 'حزام توقيت',
    'حزام توقيت': 'حزام توقيت',
    'باكاكس': 'عادم',        // Jordanian slang for exhaust/backfire noise
    'بكاكيس': 'عادم',
};

// Branch canonical names + common spelling variants (without hamza, with ب prefix, etc.)
const BRANCH_VARIANTS = {
    'عمان': 'عمان',
    'بعمان': 'عمان',
    'إربد': 'إربد',
    'اربد': 'إربد',
    'بإربد': 'إربد',
    'باربد': 'إربد',
    'الزرقاء': 'الزرقاء',
    'الزرقا': 'الزرقاء',
    'بالزرقا': 'الزرقاء',
    'بالزرقاء': 'الزرقاء',
    'زرقاء': 'الزرقاء',
    'زرقا': 'الزرقاء',
    'العقبة': 'العقبة',
    'بالعقبة': 'العقبة',
    'عقبة': 'العقبة',
};
const BRANCHES = ['عمان', 'إربد', 'الزرقاء', 'العقبة'];

// Car color variants — used to extract color from messages like "بدي السودا" / "الأبيض"
// so the LLM can identify which car from search results the customer is selecting.
const CAR_COLORS = {
    'أسود': 'أسود', 'اسود': 'أسود', 'سودا': 'أسود', 'السودا': 'أسود', 'black': 'أسود',
    'أبيض': 'أبيض', 'ابيض': 'أبيض', 'بيضا': 'أبيض', 'البيضا': 'أبيض', 'white': 'أبيض',
    'أحمر': 'أحمر', 'احمر': 'أحمر', 'حمرا': 'أحمر', 'red': 'أحمر',
    'رمادي': 'رمادي', 'رصاصي': 'رمادي', 'grey': 'رمادي', 'gray': 'رمادي',
    'فضي': 'فضي', 'silver': 'فضي',
    'أزرق': 'أزرق', 'ازرق': 'أزرق', 'blue': 'أزرق',  // 'زرقا' removed — conflicts with الزرقاء (city name)
    'بيج': 'بيج', 'بيجي': 'بيج', 'beige': 'بيج',
    'لؤلؤي': 'لؤلؤي', 'لولوي': 'لؤلؤي', 'pearl': 'لؤلؤي',
    'أخضر': 'أخضر', 'akhdar': 'أخضر', 'green': 'أخضر',
    'بني': 'بني', 'بنية': 'بني', 'brown': 'بني',
    'برتقالي': 'برتقالي', 'orange': 'برتقالي',
};

const FUEL_TYPES = {
    'كهربا': 'كهربائي', 'كهربائي': 'كهربائي', 'كهربائية': 'كهربائي',
    'electric': 'كهربائي', 'ev': 'كهربائي',
    'هجين': 'هجين', 'هايبرد': 'هجين', 'hybrid': 'هجين',
    'بنزين': 'بنزين', 'petrol': 'بنزين', 'gasoline': 'بنزين',
    'ديزل': 'ديزل', 'diesel': 'ديزل',
};

// =============================================
// Greeting / FAQ patterns (Arabic + English)
// =============================================
const GREETING_PATTERNS = /^(?:[\s!?.,👋🙋🤝🌟✨]*)(هلا|مرحبا|السلام|هاي|اهلا|أهلا|hi|hello|hey|صباح|مساء)/i;

// Numeric menu selection — customer replies with 1-5 after the greeting menu.
// Matches bare digit OR digit followed by emoji/punctuation so "1️⃣" works too.
const MENU_INTENT_MAP = {
    '1': 'purchase',
    '2': 'parts',
    '3': 'booking',
    '4': 'promotions',
    '5': 'support',
};

// Goodbye / thank-you patterns — canned farewell, no LLM needed.
const GOODBYE_PATTERNS = /^(?:شكر[اً]?|يسلمو|يعطيك|باي|وداع|مع السلامة|تمام شكرا|ما بدي|ما بدي شي|تمام ما في شي|نزلت|عادي|موفق|يا سلام|ok bye|bye|thanks?|thank you)[\s!.،؟]*$/i;

// Short affirmative responses — context-dependent "yes/ok" that must inherit
// the conversation's pending_intent rather than being treated as a new topic.
// Examples: "اه", "أيوه", "نعم", "أكيد", "تمام", "موافق", "ok", "yes"
// These must NOT be classified as greetings or unknown.
const AFFIRMATION_PATTERN = /^(?:اه|آه|أه|أيوه|ايوه|نعم|أكيد|اكيد|موافق|صح|تمام|يلا|طيب|ماشي|حلو|زين|مضبوط|يس|yes|ok|okay|sure|يوك|أيه|ايه|مم|أمم|هه|ها)[\s!.،؟🙂😊👍✅]*$/i;

// Showroom visit intent — customer wants to come in person to see a car.
// Triggers a "welcome to branch + opening hours" response instead of booking maintenance.
const VISIT_PATTERN = /(?:بدي\s+(?:اجي|أجي|آجي|اشوف|أشوف|نجي|نشوف)|بجي\s+(?:اشوف|عندكم|على\s*الفرع|للمعرض)|(?:متى|امتى)\s+(?:بقدر|اقدر|أقدر)\s+(?:اجي|أجي)|اشوفها\s+(?:شخصياً|شخصيا|وجاهاً)|بدنا\s+(?:نجي|ناجي|نشوف)\s|زيارة\s+(?:الفرع|المعرض))/i;

// Negation prefixes — if any of these appear right before an intent verb,
// the intent should NOT fire. ("ما بدي احجز" must not be tagged as booking.)
const NEGATION_REGEX = /\b(ما|مش|مو|لا)\s+/i;

const FAQ_PATTERNS = [
    {
        intent: 'faq_hours',
        // Guard: "كم ساعة بتاخذ الصيانة" asks about DURATION, not opening hours.
        // Require "ساعات" to appear without an adjacent duration verb, OR
        // use the explicit "دوام/تفتح/بأي وقت" forms which are unambiguous.
        regex: /(?:ساعات\s+(?:الدوام|العمل|الفرع|أوتو|الوكالة)|دوام|متى\s+تفتح|متى\s+بتفتح|بأي\s+وقت|opening\s+hours?|work(?:ing)?\s+hours?)/i,
        response:
            'ساعات دوامنا 🕐\n' +
            '• الأحد - الخميس: 8 صباحاً - 8 مساءً\n' +
            '• الجمعة: 8 صباحاً - 2 ظهراً\n' +
            '• السبت: 8 صباحاً - 6 مساءً\n\n' +
            'كل أفرعنا (عمان، إربد، الزرقاء، العقبة) بنفس الدوام.',
    },
    {
        intent: 'faq_branches',
        regex: /(?:كم\s+فرع|أفرعكم|الأفرع|وين\s+فروعكم|فروعكم|عندكم\s+فروع|شو\s+عندكم\s+فروع|عناوين|عنوان\s+الفرع|locations?|branches?)/i,
        response:
            'عنا 4 أفرع 📍\n' +
            '1️⃣ عمان (الرئيسي) - شارع المدينة المنورة\n' +
            '2️⃣ إربد - شارع الجامعة\n' +
            '3️⃣ الزرقاء - شارع الأمير محمد\n' +
            '4️⃣ العقبة - شارع الملك الحسين\n\n' +
            'تلفون موحد: 06-5000001',
    },
    {
        intent: 'faq_phone',
        regex: /(?:رقم\s+التلفون|تلفون|تليفون|رقمكم|كيف\s+اتواصل|phone|contact)/i,
        response:
            'تلفوننا 📞\n' +
            '06-5000001\n\n' +
            'متوفرين على واتساب طول أوقات الدوام.',
    },
    {
        intent: 'faq_payment',
        regex: /(?:طرق\s+الدفع|كيف\s+(?:ادفع|أدفع)|بتقبلوا\s+تقسيط|بتقسطوا|payment\s+methods?|installment\s+options)/i,
        response:
            'طرق الدفع المتاحة 💳\n' +
            '• كاش\n' +
            '• بطاقة (فيزا/ماستر)\n' +
            '• تحويل بنكي\n' +
            '• تقسيط حتى 60 شهر (شروط البنك)\n\n' +
            'بدك تفاصيل التقسيط لسيارة معينة؟',
    },
    {
        intent: 'faq_warranty',
        regex: /(?:ضمان|كفالة|ضماان|warranty|guarantee)/i,
        response:
            'الضمان في أوتو جوردن 🛡️\n' +
            '• السيارات الجديدة: ضمان المصنع (3-5 سنوات حسب الماركة)\n' +
            '• السيارات المستعملة المعتمدة: ضمان 6 أشهر أو 10,000 كم\n' +
            '• خدمات الصيانة: ضمان 3 أشهر أو 5,000 كم على الشغل والقطع\n\n' +
            'بدك تفاصيل ضمان ماركة معينة؟',
    },
    {
        intent: 'faq_trade_in',
        regex: /(?:استبدال\s+سيارت|أبيع\s+سيارت|بيع\s+سيارت|trade[\s-]?in|استبدل\s+سيارت)/i,
        response:
            'خدمة استبدال السيارة 🔄\n' +
            'تقدر تستبدل سيارتك الحالية عند شراء سيارة جديدة أو مستعملة.\n\n' +
            '1️⃣ نقيّم سيارتك مجاناً في أي فرع\n' +
            '2️⃣ نطرح القيمة من سعر السيارة الجديدة\n' +
            '3️⃣ تدفع الفرق فقط\n\n' +
            'بدك تحجز موعد تقييم؟',
    },
];

// =============================================
// Strong intent keywords
// =============================================
const INTENT_PATTERNS = {
    // Booking: explicit "احجز/حجز" OR repair/fix verbs OR service terms
    // Also catches:
    //   - breakdown descriptions: "سيارتي خربت/عطلت/واقفة"
    //   - colloquial service requests: "بدي اغير زيت", "غيار زيت", "بدي اعمل مكيف"
    booking:  /(?:بدي\s+(?:أحجز|احجز|حجز|اعمل\s+صيانة|أعمل\s+صيانة|اظلل|أظلل|ظلل|اعمل\s+بنشر|أعمل\s+بنشر)|حجز\s+(?:صيانة|موعد)|أحجز\s+موعد|بدي\s+(?:اصلح|أصلح|تصليح|تظليل)|اصلح\s+ال|تصليح\s+ال|تظليل\s+(?:سيارة|الشبابيك|شبابيك)|بنشر\s+(?:سيارة|العجل|الكفر)|العجل\s+مبشر|بدي\s+(?:اغير|أغير|غير)\s+(?:زيت|الزيت|كفر|الكفر|طاير|بطارية|فلتر)|غيار\s+(?:زيت|الزيت|كفر|طاير)|بدي\s+(?:اعمل|أعمل)\s+(?:مكيف|فحص|برمجة|بنشر|سيرفس|ميكانيك)|سيارت[يه]?\s+(?:خربت|عطلت|معطلة|واقفة|مشت)|(?:خربت|عطلت|معطلة)\s+(?:سيارت[يه]?|ال(?:سيارة|عربية))|book|appointment)/i,
    purchase: /(?:بدي\s+(?:أشتري|اشتري|سيارة\s+جديدة)|شو\s+عندكم\s+(?:سيارات|موديل)|أبغى\s+سيارة|buy\s+(?:a\s+)?car)/i,
    support:  /(?:بدي\s+(?:أحكي|احكي)\s+مع\s+(?:حدا|موظف|مدير)|شكوى|complaint|talk\s+to\s+(?:agent|human|manager))/i,
    parts:    /(?:قطعة|قطع\s+غيار|سبير|spare\s+part|بدي\s+(?:فلتر|بطارية|إطار|بريك))/i,
    price:    /(?:كم\s+سعر|بكم|شو\s+سعر|اسعار|أسعار|سعر\s+ال|how\s+much|price\s+of)/i,
};

module.exports = {
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
    NEGATION_REGEX,
    FAQ_PATTERNS,
    INTENT_PATTERNS,
};
