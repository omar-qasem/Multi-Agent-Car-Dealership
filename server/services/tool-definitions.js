/**
 * أوتو جوردن - Tool Definitions
 * Groq function-calling schema for all agent tools, plus the shared
 * BRANCH_ENUM used across several tool parameter shapes.
 * Split out from agent-tools.js so the executor logic isn't buried
 * under ~220 lines of schema declarations.
 */
const { CANONICAL_SLOTS, DISPLAY_SLOTS } = require('../utils/timeSlots');

// =============================================
// Tool Definitions (for Groq Function Calling)
// =============================================
// Shared branch enum — single source of truth used across all tools
const BRANCH_ENUM = { type: 'string', enum: ['عمان', 'إربد', 'الزرقاء', 'العقبة'], description: 'الفرع: عمان، إربد، الزرقاء، العقبة' };

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_cars',
      description: 'البحث عن سيارات متاحة في معرض أوتو جوردن. استخدمها لما العميل يبحث بمواصفات أو يطلب عرض الخيارات المتاحة. بدون فلاتر تُعيد كل السيارات المتاحة. مختلفة عن check_availability: هذه للبحث والتصفح، check_availability للتحقق الدقيق "هل عندكم هذه السيارة؟".',
      parameters: {
        type: 'object',
        properties: {
          make:      { type: 'string', description: 'الماركة مثل Toyota أو Hyundai أو Kia أو MG أو Chery أو Nissan أو BMW' },
          model:     { type: 'string', description: 'الموديل مثل Camry أو Tucson أو Sportage' },
          year:      { type: 'number', description: 'سنة الصنع' },
          min_price: { type: 'number', description: 'الحد الأدنى للسعر بالدينار الأردني' },
          max_price: { type: 'number', description: 'الحد الأقصى للسعر بالدينار الأردني' },
          condition: { type: 'string', enum: ['new', 'used', 'all'], description: 'new=جديدة، used=مستعملة، all=الكل' },
          branch:    BRANCH_ENUM,
          fuel_type: { type: 'string', enum: ['بنزين', 'هجين', 'كهربائي', 'ديزل'], description: 'نوع الوقود' },
          transmission: { type: 'string', enum: ['automatic', 'manual'], description: 'أوتوماتيك أو مانيوال' },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_parts_inventory',
      description: 'فحص توفر قطعة غيار في المخزون. اسأل العميل عن اسم القطعة وماركة/موديل سيارته إذا لم يذكرها قبل استدعاء هذه الأداة.',
      parameters: {
        type: 'object',
        properties: {
          name:       { type: 'string', description: 'اسم القطعة (مطلوب): فلتر زيت، بريك باد، بطارية، إطارات، شمعات، حزام توقيت...' },
          car_make:   { type: 'string', description: 'ماركة السيارة (مفيد لتحديد التوافق)' },
          car_model:  { type: 'string', description: 'موديل السيارة (مفيد لتحديد التوافق)' },
          part_number: { type: 'string', description: 'رقم القطعة إذا عرفه العميل' },
        },
        required: ['name'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_branch_availability',
      description: 'التحقق من توفر مواعيد في فرع معين في تاريخ محدد قبل الحجز. استدعها دائماً بعد جمع الفرع والتاريخ وقبل استدعاء book_maintenance. تُعيد الفترات المتاحة وهل الفرع ممتلئ أم لا.',
      parameters: {
        type: 'object',
        properties: {
          branch: BRANCH_ENUM,
          date:   { type: 'string', description: 'التاريخ بصيغة YYYY-MM-DD. حوّل أي تاريخ طبيعي من العميل (بكرا/الاثنين/15-4) إلى هذه الصيغة قبل الاستدعاء.' },
        },
        required: ['branch', 'date'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'book_maintenance',
      description: 'حجز موعد صيانة لعميل. استدعها فقط بعد جمع جميع الحقول المطلوبة: نوع الخدمة، ماركة السيارة، موديل السيارة، التاريخ (YYYY-MM-DD)، الوقت (مثل "9:00 ص")، والفرع. يجب استدعاء check_branch_availability قبلها لجلب الأوقات المتاحة. لا تخترع وقتاً — اطلبه من العميل إذا ما ذكره.',
      parameters: {
        type: 'object',
        properties: {
          customer_name:  { type: 'string', description: 'اسم العميل (اختياري)' },
          car_make:       { type: 'string', description: 'ماركة السيارة مثل Toyota أو Hyundai (مطلوب)' },
          car_model:      { type: 'string', description: 'موديل السيارة مثل Camry أو Tucson (مطلوب)' },
          car_year:       { type: 'number', description: 'سنة السيارة (اختياري)' },
          service_type: {
            type: 'string',
            description: 'نوع الخدمة (مطلوب): تغيير زيت، صيانة دورية، فحص شامل، إطارات، بريك، كهربائي، تبريد، أو أخرى',
          },
          preferred_date: { type: 'string', description: 'التاريخ بصيغة YYYY-MM-DD (مطلوب). حوّل ما يقوله العميل إلى هذه الصيغة.' },
          preferred_time: {
            type: 'string',
            description: 'الوقت المفضل (مطلوب). اختر قيمة من available_time_slots اللي رجعتها check_branch_availability. القيم المقبولة مثل: "8:00 ص"، "9:00 ص"، ... "12:00 م"، "1:00 م"، ... "7:00 م". لا تخترع وقتاً أبداً.',
            enum: [...DISPLAY_SLOTS, ...CANONICAL_SLOTS],
          },
          branch:         BRANCH_ENUM,
          notes:          { type: 'string', description: 'ملاحظات إضافية من العميل' },
        },
        required: ['service_type', 'car_make', 'car_model', 'preferred_date', 'preferred_time', 'branch'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_promotions',
      description: 'عرض العروض والتخفيضات الحالية في معرض أوتو جوردن. استدعها لما العميل يسأل عن العروض أو التخفيضات.',
      parameters: { type: 'object', properties: {} },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_branch_info',
      description: 'الحصول على معلومات تفصيلية لفرع (عنوان، تلفون، ساعات، خدمات). بدون branch parameter تُعيد كل الأفرع.',
      parameters: {
        type: 'object',
        properties: {
          branch: { ...BRANCH_ENUM, description: 'اسم الفرع. اتركه فارغاً لعرض جميع الأفرع.' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'submit_support_ticket',
      description: 'إنشاء تذكرة دعم وتحويل العميل لموظف بشري. استدعها فور ما يطلب العميل موظف حقيقي، أو عند شكوى، أو طلب إلغاء/تعديل حجز، أو أي مشكلة لا يمكن حلها آلياً.',
      parameters: {
        type: 'object',
        properties: {
          customer_name:     { type: 'string', description: 'اسم العميل (اختياري)' },
          issue_description: { type: 'string', description: 'وصف مختصر للطلب أو المشكلة' },
          category: {
            type: 'string',
            enum: ['booking_change', 'complaint', 'technical', 'sales', 'general'],
            description: 'booking_change=تعديل/إلغاء حجز، complaint=شكوى، technical=مشكلة تقنية، sales=استفسار مبيعات، general=عام',
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'أولوية التذكرة' },
        },
        required: ['issue_description'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_purchase_inquiry',
      description: 'تسجيل استفسار شراء سيارة من عميل مهتم. استدعها فقط بعد: (1) عرض نتائج search_cars للعميل و(2) تأكيد اهتمامه الجدي. لا تستدعيها مباشرةً عند أول ذكر للشراء.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'اسم العميل (اختياري)' },
          car_make:  { type: 'string', description: 'ماركة السيارة المطلوبة' },
          car_model: { type: 'string', description: 'موديل السيارة المطلوبة' },
          budget:    { type: 'number', description: 'الميزانية بالدينار الأردني' },
          financing: { type: 'boolean', description: 'هل العميل مهتم بالتقسيط؟' },
          trade_in:  { type: 'boolean', description: 'هل لديه سيارة يريد مبادلتها (trade-in)؟' },
          notes:     { type: 'string', description: 'ملاحظات عن المواصفات أو أي تفاصيل أخرى' },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_customer_bookings',
      description: 'عرض مواعيد الصيانة السابقة والقادمة للعميل الحالي. لا تحتاج معاملات — يستخدم رقم هاتف العميل تلقائياً.',
      parameters: { type: 'object', properties: {} },
    },
  },

  {
    type: 'function',
    function: {
      name: 'calculate_financing',
      description: 'حساب القسط الشهري للتمويل. قبل الاستدعاء اجمع: سعر السيارة + مبلغ الدفعة الأولى + عدد الأشهر. إذا العميل ما ذكر الدفعة الأولى اسأله، إذا ما ذكر المدة اقترح 36 شهراً كافتراضي.',
      parameters: {
        type: 'object',
        properties: {
          car_price:    { type: 'number', description: 'سعر السيارة الكامل بالدينار الأردني' },
          down_payment: { type: 'number', description: 'مبلغ الدفعة الأولى بالدينار الأردني (0 إذا بدون دفعة)' },
          months: {
            type: 'number',
            enum: [12, 24, 36, 48, 60],
            description: 'مدة التمويل بالأشهر',
          },
        },
        required: ['car_price', 'down_payment', 'months'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'compare_cars',
      description: 'مقارنة سيارتين جنباً إلى جنب. العميل لازم يذكر ماركة وموديل السيارتين. إذا ذكر موديل فقط (مثل "كامري وتوسان") استنتج الماركة من معرفتك.',
      parameters: {
        type: 'object',
        properties: {
          make1:  { type: 'string', description: 'ماركة السيارة الأولى' },
          model1: { type: 'string', description: 'موديل السيارة الأولى' },
          year1:  { type: 'number', description: 'سنة السيارة الأولى (اختياري)' },
          make2:  { type: 'string', description: 'ماركة السيارة الثانية' },
          model2: { type: 'string', description: 'موديل السيارة الثانية' },
          year2:  { type: 'number', description: 'سنة السيارة الثانية (اختياري)' },
        },
        required: ['make1', 'model1', 'make2', 'model2'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'التحقق الدقيق من توفر سيارة معينة: عدد النسخ، الألوان، الفروع. استخدمها لما العميل يسأل "هل عندكم؟" أو "كم واحدة عندكم؟" — مختلفة عن search_cars التي للتصفح العام.',
      parameters: {
        type: 'object',
        properties: {
          make:   { type: 'string', description: 'ماركة السيارة' },
          model:  { type: 'string', description: 'موديل السيارة' },
          year:   { type: 'number', description: 'سنة الصنع (اختياري)' },
          branch: { ...BRANCH_ENUM, description: 'فرع محدد للتحقق (اختياري)' },
        },
        required: ['make', 'model'],
      },
    },
  },
];
module.exports = { BRANCH_ENUM, TOOL_DEFINITIONS };
