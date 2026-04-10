/**
 * أوتو جوردن - تحليل المشاعر والمواضيع والنوايا
 * Sentiment Analysis + Topic Detection + Intent Detection
 * مخصص لمتجر سيارات أردني
 */

// كلمات إيجابية - أردنية وعربية وإنجليزية
const positiveWords = [
    // أردني
    'هلا', 'يسلمو', 'تسلم', 'يعطيك العافية', 'الله يعافيك', 'ما يقصر',
    'تكرم', 'أكيد', 'حلو', 'زابط', 'رهيب', 'خرافي', 'بتجنن', 'عال',
    'مرتب', 'نظيف', 'ولا أحلى', 'يا سلام', 'مبسوط', 'مبسوطة',
    // عربي عام
    'شكراً', 'شكرا', 'ممتاز', 'رائع', 'جميل', 'مفيد', 'أحسنت', 'بارك الله',
    'سعيد', 'ممنون', 'أفضل', 'مريح', 'سهل', 'واضح', 'موفق', 'تمام', 'عظيم',
    'مميز', 'يعطيك العافية', 'مشكور', 'جزاك الله', 'يستاهل', 'ممتازة',
    // إنجليزي
    'thank', 'thanks', 'great', 'excellent', 'good', 'awesome', 'perfect',
    'wonderful', 'amazing', 'helpful', 'satisfied', 'happy', 'love',
];

// كلمات سلبية
const negativeWords = [
    // أردني
    'مش زابط', 'مش تمام', 'والله زفت', 'مش معقول', 'شو هاد', 'يا زلمة',
    'مش رضيان', 'زهقت', 'تأخرتوا', 'وين صرتوا', 'مش قادر',
    // عربي عام
    'سيء', 'مزعج', 'مشكلة', 'خطأ', 'غلطة', 'بطيء', 'رديء', 'فشل',
    'مستحيل', 'ما يصير', 'ما اشتغل', 'غلط', 'شكوى', 'احتجاج',
    'زعلان', 'متضايق', 'ما عجبني', 'خسارة', 'ما ينفع', 'ناقص',
    'غالي', 'نصب', 'احتيال', 'كذب', 'وقاحة',
    // إنجليزي
    'bad', 'terrible', 'awful', 'horrible', 'wrong', 'slow', 'fail',
    'error', 'problem', 'issue', 'broken', 'useless', 'disappointed',
    'angry', 'frustrated', 'upset', 'complaint', 'scam', 'expensive',
];

// مواضيع مخصصة لمتجر سيارات
const topicKeywords = {
    'سيارات': [
        'سيارة', 'سيارات', 'معرض', 'موديل', 'ماركة', 'جديدة', 'مستعملة',
        'car', 'cars', 'vehicle', 'toyota', 'تويوتا', 'hyundai', 'هيونداي',
        'kia', 'كيا', 'mg', 'chery', 'شيري', 'bmw', 'mercedes', 'مرسيدس',
        'honda', 'هوندا', 'nissan', 'نيسان', 'كامري', 'كورولا', 'توسان',
        'سبورتاج', 'لاندكروزر', 'برادو', 'هايلكس', 'فورتشنر', 'راف فور',
        'SUV', 'سيدان', 'بيكب', 'شراء', 'بيع',
    ],
    'صيانة': [
        'صيانة', 'تصليح', 'تصليحة', 'ميكانيك', 'ميكانيكي', 'عطل', 'عطلة',
        'خربان', 'خراب', 'مشكلة بالسيارة', 'سيرفس', 'service', 'maintenance',
        'زيت', 'فلتر', 'فرامل', 'بريك', 'مكيف', 'فريون', 'مساعد',
        'كمبيوتر', 'فحص', 'check', 'دورية',
    ],
    'قطع غيار': [
        'قطعة', 'قطع', 'غيار', 'بديل', 'سبير', 'parts', 'spare',
        'فلتر', 'بطارية', 'إطار', 'تاير', 'بواجي', 'سير', 'بطانة',
        'ديسك', 'مساعد', 'رديتر', 'لمبة', 'شمعة', 'زيت', 'كمبروسر',
        'ثيرموستات', 'طرمبة', 'دينمو', 'سلف', 'مارش',
    ],
    'مواعيد': [
        'موعد', 'حجز', 'حجزت', 'بدي أحجز', 'وقت', 'متى', 'يوم',
        'appointment', 'booking', 'schedule', 'slot', 'فاضي', 'متاح',
        'بكرة', 'اليوم', 'الأسبوع', 'الشهر',
    ],
    'أسعار': [
        'سعر', 'أسعار', 'تكلفة', 'كم', 'كلف', 'price', 'cost', 'how much',
        'ميزانية', 'تقسيط', 'أقساط', 'دفعة', 'تمويل', 'financing',
        'خصم', 'عرض', 'تخفيض', 'discount', 'offer', 'غالي', 'رخيص',
    ],
    'تذاكر دعم': [
        'شكوى', 'مشكلة', 'complaint', 'problem', 'أحكي مع حدا',
        'بشري', 'موظف', 'مدير', 'مسؤول', 'حل', 'تعويض', 'ما رد',
        'إسكاليشن', 'escalation', 'تحويل',
    ],
    'أفرع': [
        'فرع', 'أفرع', 'عنوان', 'موقع', 'وين', 'أقرب', 'branch',
        'location', 'address', 'عمان', 'إربد', 'الزرقاء', 'العقبة',
        'ساعات', 'دوام', 'مفتوح', 'مسكر', 'خريطة', 'maps',
    ],
    'عروض': [
        'عرض', 'عروض', 'تخفيض', 'تخفيضات', 'خصم', 'حملة', 'promotion',
        'offer', 'deal', 'sale', 'مجاني', 'free', 'هدية', 'بونص',
    ],
    'عام': [], // Default
};

// نوايا العميل
const intentKeywords = {
    'شراء سيارة': ['بدي أشتري', 'بدي سيارة', 'عندكم سيارة', 'شو عندكم', 'أبغى سيارة', 'buy', 'purchase'],
    'حجز صيانة': ['بدي أحجز', 'بدي صيانة', 'حجز موعد', 'بدي موعد', 'book', 'appointment'],
    'استفسار قطع': ['عندكم قطعة', 'بدي قطعة', 'في عندكم', 'متوفر', 'available'],
    'فحص سيارة': ['بدي فحص', 'فحص شامل', 'check', 'inspection', 'قبل الشراء'],
    'تحويل لبشري': ['بدي أحكي مع حدا', 'بشري', 'موظف', 'مدير', 'human', 'agent', 'representative'],
    'شكوى': ['بدي أشتكي', 'شكوى', 'مش راضي', 'complaint', 'مشكلة'],
    'سؤال عام': ['شو', 'كيف', 'وين', 'متى', 'ليش', 'هل', 'what', 'how', 'where', 'when'],
    'تحية': ['هلا', 'مرحبا', 'السلام', 'صباح', 'مساء', 'هاي', 'hi', 'hello'],
};

/**
 * تحليل مشاعر النص
 */
function analyzeSentiment(text) {
    if (!text) return { sentiment: 'neutral', score: 0, label: 'محايد' };

    const lowerText = text.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
        if (lowerText.includes(word.toLowerCase())) positiveScore++;
    });

    negativeWords.forEach(word => {
        if (lowerText.includes(word.toLowerCase())) negativeScore++;
    });

    const totalScore = positiveScore - negativeScore;

    if (totalScore > 0) {
        return { sentiment: 'positive', score: Math.min(totalScore / 3, 1), label: 'إيجابي', emoji: '😊' };
    } else if (totalScore < 0) {
        return { sentiment: 'negative', score: Math.max(totalScore / 3, -1), label: 'سلبي', emoji: '😞' };
    }
    return { sentiment: 'neutral', score: 0, label: 'محايد', emoji: '😐' };
}

/**
 * تحديد موضوع الرسالة
 */
// أوزان للكلمات عالية التمييز (الكلمات المسكوت عنها لها وزن 1)
// الكلمات القوية ترجح الموضوع الصحيح عند التضارب
const keywordWeights = {
    // صيانة (أعلى وزن للكلمات المحددة جداً)
    'عطل': 3, 'عطلة': 3, 'خربان': 3, 'تصليح': 3, 'تصليحة': 3, 'صيانة': 3,
    'فرامل': 3, 'بريك': 3, 'مكيف': 2, 'فريون': 3, 'مساعد': 2, 'ميكانيك': 3,
    'سيرفس': 3, 'maintenance': 3, 'service': 2, 'رديتر': 3, 'كمبروسر': 3,
    'ثيرموستات': 3, 'بطانة': 3, 'ديسك': 2, 'طرمبة': 3, 'دينمو': 3, 'مارش': 3,
    // قطع غيار (قوية)
    'غيار': 3, 'سبير': 3, 'spare': 3, 'parts': 3, 'بواجي': 3, 'شمعة': 2, 'بطارية': 2,
    // حجوزات
    'حجز': 3, 'موعد': 3, 'حجزت': 3, 'appointment': 3, 'booking': 3,
    // أسعار
    'سعر': 2, 'تقسيط': 3, 'أقساط': 3, 'تمويل': 3, 'financing': 3,
    // أفرع
    'فرع': 2, 'أفرع': 3, 'عنوان': 2, 'branch': 3, 'location': 2, 'ساعات': 2, 'دوام': 2,
    // شكاوى
    'شكوى': 3, 'complaint': 3, 'تعويض': 3, 'إسكاليشن': 3, 'escalation': 3,
    // عروض
    'تخفيض': 2, 'خصم': 2, 'promotion': 3, 'deal': 2, 'sale': 2,
    // سيارات (كلمات عامة — وزن منخفض تجنباً للتضارب)
    'سيارة': 1, 'سيارات': 1, 'car': 1, 'vehicle': 1,
};

function detectTopic(text) {
    if (!text) return 'عام';

    const lowerText = text.toLowerCase();
    let maxScore = 0;
    let detectedTopic = 'عام';

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        let score = 0;
        keywords.forEach(keyword => {
            const kwLower = keyword.toLowerCase();
            if (lowerText.includes(kwLower)) {
                score += keywordWeights[kwLower] || 1;
            }
        });
        if (score > maxScore) {
            maxScore = score;
            detectedTopic = topic;
        }
    });

    return detectedTopic;
}

/**
 * تحديد نية العميل
 */
function detectIntent(text) {
    if (!text) return 'سؤال عام';

    const lowerText = text.toLowerCase();
    let maxMatches = 0;
    let detectedIntent = 'سؤال عام';

    Object.entries(intentKeywords).forEach(([intent, keywords]) => {
        let matches = 0;
        keywords.forEach(keyword => {
            if (lowerText.includes(keyword.toLowerCase())) matches++;
        });
        if (matches > maxMatches) {
            maxMatches = matches;
            detectedIntent = intent;
        }
    });

    return detectedIntent;
}

/**
 * استخراج الكلمات الأكثر استخداماً
 */
function extractTopWords(messages) {
    const stopWords = new Set([
        'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'هو', 'هي',
        'انا', 'أنا', 'انت', 'أنت', 'نحن', 'هم', 'كان', 'كانت', 'يكون',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she',
        'we', 'they', 'it', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'لا', 'ما', 'لم', 'لن', 'قد', 'كل', 'اللي', 'هاد',
        'بس', 'يعني', 'وين', 'شو', 'كيف', 'ليش', 'هل',
    ]);

    const wordCount = {};

    messages.forEach(msg => {
        if (!msg) return;
        const words = msg.split(/[\s,،.!?؟!]+/);
        words.forEach(word => {
            word = word.trim().toLowerCase();
            if (word.length > 2 && !stopWords.has(word)) {
                wordCount[word] = (wordCount[word] || 0) + 1;
            }
        });
    });

    return Object.entries(wordCount)
        .map(([text, value]) => ({ text, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 50);
}

module.exports = { analyzeSentiment, detectTopic, detectIntent, extractTopWords };
