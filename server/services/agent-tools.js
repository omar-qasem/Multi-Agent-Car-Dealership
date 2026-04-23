/**
 * أوتو جوردن - Agent Tools
 * AI Agent Function Calling Tools for Car Dealership
 */

const db = require('../database/db');
const {
  CANONICAL_SLOTS,
  DISPLAY_SLOTS,
  canonicalToDisplay,
  parseTime,
  isValidSlot,
} = require('../utils/timeSlots');

// =============================================
// Ticket urgency detection
// =============================================
// Auto-classify ticket priority from issue text so emergencies don't wait
// in the medium queue. Returns 'urgent'|'high'|null (null = use LLM value).
function detectTicketUrgency(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  // Roadside / safety emergencies — respond within 15 minutes
  if (/خرب|خراب|حادث|عطل|طريق|طوار[ئئ]|عاجل|مستعجل|breakdown|emergency|stuck|واقف|موقوف|مش شغال/.test(t)) {
    return 'urgent';
  }
  // Complaints and significant issues — respond within 1 hour
  if (/شكو[ىي]|مش راضي|مو راضي|غلط|غبن|حق[نا]+|ضمان|كفالة|مشكلة|complaint|wrong|cheated/.test(t)) {
    return 'high';
  }
  return null;
}

const SLA_MESSAGES = {
  urgent: 'سيتواصل معك فريقنا خلال 15 دقيقة 🔴',
  high:   'سيتواصل معك فريقنا خلال ساعة 🟡',
  medium: 'سيتواصل معك فريقنا خلال 24 ساعة 🟢',
  low:    'سيتواصل معك فريقنا خلال 48 ساعة 🟢',
};

// =============================================
// Staff notification helper
// =============================================
// Sends a WhatsApp message to STAFF_NOTIFICATION_PHONE when a booking or
// ticket is created, so staff know to follow up. Fire-and-forget — never
// blocks or fails the tool result.
async function notifyStaff(message) {
  const phone = process.env.STAFF_NOTIFICATION_PHONE;
  if (!phone) return; // not configured — skip silently
  try {
    // Lazy-require to avoid circular dependency (whatsapp.service → agent-tools would be circular)
    const whatsapp = require('./whatsapp.service');
    await whatsapp.sendTextMessage(phone, message);
  } catch (e) {
    console.warn('[TOOL] notifyStaff failed (non-critical):', e?.message);
  }
}

// =============================================
// P0-03: Write-tool classification + graceful-fail
// =============================================
// Tools that WRITE to the database. When these fail we MUST NOT pretend the
// write succeeded — the LLM needs explicit signals that the record is not
// persisted so it tells the customer the truth and offers a recovery path.
const WRITE_TOOLS = new Set([
  'book_maintenance',
  'submit_support_ticket',
  'create_purchase_inquiry',
]);

/**
 * Classify an error thrown while executing a tool.
 *  - 'transient'  : likely network / timeout — retry might work
 *  - 'database'   : Supabase-layer failure that was surfaced by sbThrow()
 *  - 'validation' : our own validation (shouldn't usually throw, but handle it)
 *  - 'unknown'    : everything else
 */
function classifyError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = err?.code || '';
  if (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('socket hang up') ||
    code === '57014' || code === '08006' || code === '08003'
  ) return 'transient';
  if (msg.includes('[db] supabase') || msg.includes('supabase')) return 'database';
  return 'unknown';
}

/**
 * Retry a write operation a couple of times on transient errors.
 * Keeps the total latency bounded (100ms + 250ms ≈ 350ms at most) so we
 * don't blow the 20s Meta webhook budget.
 */
async function withWriteRetry(label, fn) {
  const attempts = [0, 100, 250]; // delays in ms before each attempt
  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await new Promise(r => setTimeout(r, attempts[i]));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      if (kind !== 'transient') throw err; // only retry transient
      console.warn(`[TOOL RETRY] ${label} attempt ${i + 1} failed: ${err?.message || err}`);
    }
  }
  throw lastErr;
}

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

// =============================================
// Tool Executors
// =============================================
async function executeTool(toolName, args, customerPhone) {
  // Defensive args coercion — LLMs sometimes emit `function.arguments = "null"`
  // (literal string "null") which JSON.parse decodes to the JavaScript `null`.
  // Downstream code then crashes with "Cannot read properties of null (reading
  // '<field>')" — see prod log 2026-04-18 21:44 for get_branch_info. We also
  // coerce non-object values (strings/numbers) to an empty object so no case
  // handler needs to defend itself individually.
  if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
    args = {};
  }

  try {
    switch (toolName) {

      case 'search_cars': {
        const cars = await db.searchCars(args);
        if (cars.length === 0) {
          return { success: false, message: 'ما في سيارات متوفرة بهالمواصفات هلأ. بتقدر تحكيلي أكثر عن اللي بدك إياه؟' };
        }
        return {
          success: true,
          count: cars.length,
          cars: cars.map(c => ({
            id: c.id,
            name: `${c.make} ${c.model} ${c.year}`,
            color: c.color,
            price: `${c.price.toLocaleString()} دينار`,
            condition: c.condition === 'new' ? 'جديدة' : `مستعملة (${c.mileage.toLocaleString()} كم)`,
            branch: c.branch,
            engine: c.engine,
            transmission: c.transmission,
            fuel_type: c.fuel_type,
            features: c.features,
          })),
        };
      }

      case 'check_parts_inventory': {
        const parts = await db.searchParts(args);
        if (parts.length === 0) {
          return { success: false, message: 'ما لقيت هالقطعة في المخزون هلأ. ممكن نطلبها إلك - بدها 2-3 أيام تجي.' };
        }
        return {
          success: true,
          parts: parts.map(p => ({
            name: p.name,
            part_number: p.part_number,
            price: `${p.price} دينار`,
            available: p.quantity > 0,
            quantity: p.quantity,
            compatible_with: (Array.isArray(p.compatible) ? p.compatible : []).join('، '),
          })),
        };
      }

      case 'check_branch_availability': {
        const { branch, date } = args;
        const VALID_BRANCHES = ['عمان', 'إربد', 'الزرقاء', 'العقبة'];
        if (!VALID_BRANCHES.includes(branch)) {
          return {
            success: false,
            message: `الفرع "${branch}" غير صحيح. الأفرع المتاحة: عمان، إربد، الزرقاء، العقبة.`,
          };
        }

        const MAX_DAILY_BOOKINGS = 12;
        // P0-02: TIME_SLOTS is now driven by the canonical slot definition so
        // comparisons with stored bookings are format-agnostic. We present
        // Arabic display forms to the LLM/customer but compare canonically.
        const existingBookings = await db.getBookingsByBranchAndDate(branch, date);
        const bookedCount = existingBookings.length;
        const isFull = bookedCount >= MAX_DAILY_BOOKINGS;

        // Normalise every stored booking's time to canonical so legacy rows
        // written in mixed formats ('9:00 ص', '9:00 صباحاً', '09:00') all match.
        const takenCanonical = new Set(
          existingBookings
            .map(b => parseTime(b.preferred_time))
            .filter(Boolean)
        );
        const availableCanonical = CANONICAL_SLOTS.filter(s => !takenCanonical.has(s));
        // Show Arabic to the LLM/customer — but advertise both forms so the LLM
        // can echo back either one and our parser will accept it.
        const availableSlots = availableCanonical.map(canonicalToDisplay);

        if (isFull) {
          // Suggest next 3 working days as alternatives
          const suggestions = [];
          const d = new Date(date);
          while (suggestions.length < 3) {
            d.setDate(d.getDate() + 1);
            const dayOfWeek = d.getDay(); // 5 = Friday (closed)
            if (dayOfWeek !== 5) { // Skip Fridays
              suggestions.push(d.toISOString().split('T')[0]);
            }
          }
          return {
            success: true,
            is_available: false,
            branch,
            date,
            booking_count: bookedCount,
            max_capacity: MAX_DAILY_BOOKINGS,
            message: `فرع ${branch} محجوز بالكامل بتاريخ ${date} (${bookedCount}/${MAX_DAILY_BOOKINGS} مواعيد).`,
            suggested_dates: suggestions,
          };
        }

        return {
          success: true,
          is_available: true,
          branch,
          date,
          booking_count: bookedCount,
          available_slots_count: MAX_DAILY_BOOKINGS - bookedCount,
          available_time_slots: availableSlots,           // Arabic display form for the LLM/customer
          available_slots_canonical: availableCanonical,  // 24-hour form — useful for re-prompting
          message: `فرع ${branch} متوفر بتاريخ ${date}. ${MAX_DAILY_BOOKINGS - bookedCount} مواعيد متاحة.`,
        };
      }

      case 'book_maintenance': {
        // Hard-validate all required fields — the LLM should have collected them via conversation.
        // P0-02: preferred_time is now required + must parse into a canonical slot.
        const missing = [];
        if (!args.car_make     || String(args.car_make).trim()     === '') missing.push('ماركة السيارة (مثلاً: Toyota)');
        if (!args.car_model    || String(args.car_model).trim()    === '') missing.push('موديل السيارة (مثلاً: Camry)');
        if (!args.service_type || String(args.service_type).trim()=== '') missing.push('نوع الخدمة (مثلاً: تغيير زيت)');
        if (!args.preferred_date || String(args.preferred_date).trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(args.preferred_date)) {
          missing.push('التاريخ بصيغة YYYY-MM-DD');
        } else {
          // Reject past dates — "أمس" or any date before today Jordan time (UTC+3)
          const today = new Date();
          today.setUTCHours(today.getUTCHours() + 3); // shift to UTC+3
          const todayStr = today.toISOString().split('T')[0];
          if (args.preferred_date < todayStr) {
            missing.push(`التاريخ (${args.preferred_date} في الماضي — يجب أن يكون من اليوم ${todayStr} فأكثر)`);
          }
        }
        if (!args.preferred_time || String(args.preferred_time).trim() === '') {
          missing.push('الوقت المفضل (مثلاً: 9:00 ص)');
        }
        if (!args.branch       || String(args.branch).trim()       === '') missing.push('الفرع (عمان، إربد، الزرقاء، العقبة)');

        if (missing.length > 0) {
          return {
            success: false,
            needs_more_info: true,
            missing_fields: missing,
            message: `لازم تتأكد من المعلومات الناقصة قبل الحجز: ${missing.join('، ')}. اسأل العميل عنها أولاً.`,
          };
        }

        const VALID_BRANCHES = ['عمان', 'إربد', 'الزرقاء', 'العقبة'];
        if (!VALID_BRANCHES.includes(args.branch)) {
          return {
            success: false,
            message: `الفرع "${args.branch}" غير صحيح. الأفرع المتاحة: عمان، إربد، الزرقاء، العقبة.`,
          };
        }

        // Canonicalize time. Reject (don't default) anything we can't map to a
        // real offered slot — that was the silent-bad-booking bug.
        const canonicalTime = parseTime(args.preferred_time);
        if (!canonicalTime || !isValidSlot(canonicalTime)) {
          return {
            success: false,
            needs_more_info: true,
            missing_fields: ['الوقت المفضل'],
            message: `الوقت "${args.preferred_time}" غير مدرج في المواعيد المتاحة. اطلب من العميل يختار وقت من: ${DISPLAY_SLOTS.join('، ')}.`,
            available_slots: DISPLAY_SLOTS,
          };
        }

        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;

        // upsertCustomer is best-effort — don't block the booking if the
        // customer row fails to write (booking is still the important record).
        try {
          await withWriteRetry('upsertCustomer', () => db.upsertCustomer(customerPhone, {
            name: customerName,
            car_make: args.car_make,
            car_model: args.car_model,
          }));
        } catch (e) {
          console.warn('[TOOL] book_maintenance: upsertCustomer failed, continuing:', e?.message);
        }

        const booking = await withWriteRetry('createBooking', () => db.createBooking({
          customer_phone:  customerPhone,
          customer_name:   customerName,
          car_make:        args.car_make,
          car_model:       args.car_model,
          car_year:        args.car_year || null,
          service_type:    args.service_type,
          preferred_date:  args.preferred_date,
          preferred_time:  canonicalTime, // canonical "HH:mm" is the source of truth
          branch:          args.branch,
          notes:           args.notes || '',
        }));

        // P1-01: slot was just booked by another customer between
        // check_branch_availability and book_maintenance. Tell the LLM to
        // apologize and re-prompt with a different time. Do NOT pretend the
        // booking succeeded.
        if (booking?.slot_taken) {
          const displayTimeTaken = canonicalToDisplay(canonicalTime);
          return {
            success: false,
            write_persisted: false,
            slot_taken: true,
            conflict: booking.conflict,
            message:
              `معذرة، تم حجز الوقت ${displayTimeTaken} في فرع ${args.branch} يوم ${args.preferred_date} من عميل ثاني قبل لحظات. ` +
              'استدعِ check_branch_availability مرة ثانية لنفس التاريخ واقترح على العميل وقت بديل من القائمة المحدّثة.',
            suggestion: 'call_check_branch_availability_again',
          };
        }

        const displayTime = canonicalToDisplay(canonicalTime);

        // Notify staff about the new booking (fire-and-forget).
        notifyStaff(
          `🔧 حجز جديد #${booking.id}\n` +
          `👤 ${customerName} | 📱 ${customerPhone}\n` +
          `🚗 ${args.car_make} ${args.car_model}\n` +
          `🛠 ${args.service_type}\n` +
          `📅 ${args.preferred_date} | ⏰ ${displayTime}\n` +
          `🏢 فرع ${args.branch}`
        );

        return {
          success: true,
          booking_id: booking.id,
          message: 'تم الحجز بنجاح! سيتصل بكم فريقنا خلال ساعات لتأكيد الموعد.',
          details: {
            booking_id: booking.id,
            service:    booking.service_type,
            date:       booking.preferred_date,
            time:       displayTime,
            time_canonical: canonicalTime,
            branch:     booking.branch,
            car:        `${booking.car_make} ${booking.car_model}`,
          },
        };
      }

      case 'get_promotions': {
        const promos = await db.getActivePromotions();
        return { success: true, promotions: promos };
      }

      case 'get_branch_info': {
        const branches = {
          'عمان': { name: 'عمان (الرئيسي)', address: 'شارع المدينة المنورة، قرب دوار الداخلية', phone: '06-5000001', hours: 'أيام الأسبوع 8ص-8م | الجمعة 8ص-2م | السبت 8ص-6م', services: 'مبيعات، صيانة، قطع غيار، سمكرة ودهان' },
          'إربد': { name: 'إربد', address: 'شارع الجامعة، بجانب مستشفى الأمير راشد', phone: '02-7000001', hours: 'أيام الأسبوع 8ص-7م | الجمعة 8ص-2م | السبت 8ص-5م', services: 'مبيعات، صيانة، قطع غيار' },
          'الزرقاء': { name: 'الزرقاء', address: 'شارع الأمير محمد، بجانب سيتي مول', phone: '05-3000001', hours: 'أيام الأسبوع 8ص-7م | الجمعة 8ص-2م | السبت 8ص-5م', services: 'مبيعات، صيانة، قطع غيار' },
          'العقبة': { name: 'العقبة', address: 'شارع الملك طلال، المنطقة الحرة', phone: '03-2000001', hours: 'أيام الأسبوع 8ص-7م | الجمعة 8ص-2م | السبت 8ص-5م', services: 'مبيعات، صيانة' },
        };

        if (args.branch && branches[args.branch]) {
          return { success: true, branch: branches[args.branch] };
        }
        return { success: true, branches: Object.values(branches) };
      }

      case 'submit_support_ticket': {
        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;

        // Auto-detect urgency from issue text so emergencies aren't waiting 24h.
        // LLM-provided priority is used only when no urgency keywords are found.
        const urgencyPriority = detectTicketUrgency(args.issue_description || '');
        const finalPriority = urgencyPriority || args.priority || 'medium';

        try {
          await withWriteRetry('upsertCustomer', () => db.upsertCustomer(customerPhone, { name: customerName }));
        } catch (e) {
          console.warn('[TOOL] submit_support_ticket: upsertCustomer failed, continuing:', e?.message);
        }

        const ticket = await withWriteRetry('createTicket', () => db.createTicket({
          customer_phone:    customerPhone,
          customer_name:     customerName,
          issue_description: args.issue_description,
          category:          args.category || 'general',
          priority:          finalPriority,
        }));

        const slaMsg = SLA_MESSAGES[ticket.priority] || SLA_MESSAGES.medium;
        const priorityEmoji = { urgent: '🔴 عاجل', high: '🟡 مرتفع', medium: '🟢 متوسط', low: '🟢 عادي' }[ticket.priority] || '';

        // Notify staff with priority flag (fire-and-forget).
        notifyStaff(
          `🎫 تذكرة دعم جديدة #${ticket.id} — ${priorityEmoji}\n` +
          `👤 ${customerName} | 📱 ${customerPhone}\n` +
          `📋 ${args.issue_description?.substring(0, 100) || ''}`
        );

        return {
          success: true,
          ticket_id: ticket.id,
          priority: ticket.priority,
          message: `تم فتح تذكرة دعم رقم ${ticket.id} ✅\n${slaMsg}\nرقم الدعم: 06-5000001`,
          details: { ticket_id: ticket.id, priority: ticket.priority, sla: slaMsg },
        };
      }

      case 'create_purchase_inquiry': {
        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;
        try {
          await withWriteRetry('upsertCustomer', () => db.upsertCustomer(customerPhone, { name: customerName }));
        } catch (e) {
          console.warn('[TOOL] create_purchase_inquiry: upsertCustomer failed, continuing:', e?.message);
        }

        const inquiry = await withWriteRetry('createInquiry', () => db.createInquiry({
          customer_phone: customerPhone,
          customer_name:  customerName,
          car_make:       args.car_make  || '',
          car_model:      args.car_model || '',
          budget:         args.budget    || null,
          financing:      args.financing === true,
          trade_in:       args.trade_in  === true,
          notes:          args.notes     || '',
        }));

        return {
          success: true,
          inquiry_id: inquiry.id,
          message: 'تم تسجيل استفسارك. سيتواصل معك فريق المبيعات لدينا قريباً.',
        };
      }

      case 'get_customer_bookings': {
        const bookings = await db.getCustomerBookings(customerPhone);
        if (bookings.length === 0) {
          return { success: true, message: 'ما في مواعيد مسجلة لهذا الرقم بعد.', bookings: [] };
        }
        return { success: true, bookings };
      }

      // ------------------------------------------------------------------
      // NEW TOOL: calculate_financing
      // حساب القسط الشهري باستخدام معادلة PMT (معدل فائدة 8% سنوياً)
      // ------------------------------------------------------------------
      case 'calculate_financing': {
        const { car_price, down_payment, months } = args;

        if (down_payment >= car_price) {
          return {
            success: false,
            message: 'الدفعة الأولى أكبر من أو تساوي سعر السيارة. لا حاجة للتمويل.',
          };
        }

        const financed = car_price - down_payment;
        const annualRate = 0.08; // 8% APR - معدل الفائدة السنوي المعتمد في أوتو جوردن
        const monthlyRate = annualRate / 12;

        // PMT formula: P * r / (1 - (1+r)^-n)
        const monthlyPayment = financed * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
        const totalCost = down_payment + (monthlyPayment * months);
        const totalInterest = totalCost - car_price;

        // Build comparison table for different periods
        const options = [12, 24, 36, 48, 60].map(n => {
          const mp = financed * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
          return {
            months: n,
            monthly_payment: Math.round(mp),
            total_cost: Math.round(down_payment + mp * n),
          };
        });

        return {
          success: true,
          summary: {
            car_price: car_price,
            down_payment: down_payment,
            financed_amount: Math.round(financed),
            months: months,
            monthly_payment: Math.round(monthlyPayment),
            total_cost: Math.round(totalCost),
            total_interest: Math.round(totalInterest),
            annual_rate_percent: 8,
          },
          all_options: options,
          note: 'الأرقام تقريبية بناءً على معدل فائدة 8% سنوياً. التفاصيل الدقيقة تحدد مع قسم المبيعات.',
        };
      }

      // ------------------------------------------------------------------
      // NEW TOOL: compare_cars
      // مقارنة سيارتين من المخزون جنباً إلى جنب
      // ------------------------------------------------------------------
      case 'compare_cars': {
        const { make1, model1, make2, model2 } = args;

        const [cars1, cars2] = await Promise.all([
          db.searchCars({ make: make1, model: model1 }),
          db.searchCars({ make: make2, model: model2 }),
        ]);

        // Take the best representative (newest, available)
        const pick = (list) => {
          const available = list.filter(c => c.status === 'available');
          const pool = available.length > 0 ? available : list;
          return pool.sort((a, b) => b.year - a.year)[0] || null;
        };

        const car1 = pick(cars1);
        const car2 = pick(cars2);

        if (!car1 && !car2) {
          return {
            success: false,
            message: `ما لقيت ${make1} ${model1} ولا ${make2} ${model2} في المخزون حالياً.`,
          };
        }

        const formatCar = (car, label) => {
          if (!car) return { available: false, label };
          return {
            available: true,
            label,
            name: `${car.make} ${car.model} ${car.year}`,
            price: car.price,
            price_formatted: `${car.price.toLocaleString()} دينار`,
            condition: car.condition === 'new' ? 'جديدة' : `مستعملة (${car.mileage?.toLocaleString() || '?'} كم)`,
            engine: car.engine || 'غير محدد',
            transmission: car.transmission || 'غير محدد',
            fuel_type: car.fuel_type || 'بنزين',
            color: car.color,
            branch: car.branch,
            features: car.features || [],
            status: car.status,
          };
        };

        const c1 = formatCar(car1, `${make1} ${model1}`);
        const c2 = formatCar(car2, `${make2} ${model2}`);

        // Build comparison insights
        const insights = [];
        if (c1.available && c2.available) {
          const priceDiff = Math.abs(car1.price - car2.price);
          const cheaper = car1.price < car2.price ? c1.name : c2.name;
          if (priceDiff > 0) {
            insights.push(`${cheaper} أرخص بـ ${priceDiff.toLocaleString()} دينار`);
          }
        }

        return {
          success: true,
          car1: c1,
          car2: c2,
          insights,
          note: 'المقارنة مبنية على أحدث نسخة متاحة من كل موديل في المخزون.',
        };
      }

      // ------------------------------------------------------------------
      // NEW TOOL: check_availability
      // التحقق الدقيق من توفر سيارة معينة مع تفاصيل الألوان والفروع
      // ------------------------------------------------------------------
      case 'check_availability': {
        const { make, model, year, branch } = args;

        // Use status:'all' + high limit so we get accurate counts
        // (default searchCars only returns 'available' with limit 10)
        const allMatches = await db.searchCars({ make, model, year, branch, status: 'all', limit: 50 });
        const available = allMatches.filter(c => c.status === 'available');
        const reserved = allMatches.filter(c => c.status === 'reserved');

        if (allMatches.length === 0) {
          return {
            success: true,
            available: false,
            count: 0,
            message: `للأسف ما عندنا ${make} ${model}${year ? ` ${year}` : ''} ${branch ? `في فرع ${branch}` : ''} هلأ.`,
            suggestion: 'بتقدر تسجل استفسار شراء وبنتصل فيك لما يجي.',
          };
        }

        // Group by branch
        const byBranch = {};
        available.forEach(c => {
          if (!byBranch[c.branch]) byBranch[c.branch] = [];
          byBranch[c.branch].push(c);
        });

        // Unique colors available
        const colors = [...new Set(available.map(c => c.color).filter(Boolean))];

        // Price range
        const prices = available.map(c => c.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        return {
          success: true,
          available: available.length > 0,
          total_in_stock: allMatches.length,
          available_count: available.length,
          reserved_count: reserved.length,
          colors_available: colors,
          price_range: prices.length > 0
            ? (minPrice === maxPrice
              ? `${minPrice.toLocaleString()} دينار`
              : `${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()} دينار`)
            : 'غير محدد',
          branches: Object.entries(byBranch).map(([br, cars]) => ({
            branch: br,
            count: cars.length,
            colors: [...new Set(cars.map(c => c.color))],
          })),
          years_available: [...new Set(available.map(c => c.year))].sort((a, b) => b - a),
        };
      }

      default:
        return { success: false, error: `أداة غير معروفة: ${toolName}` };
    }
  } catch (error) {
    const kind = classifyError(error);
    const rawMsg = error?.message || String(error);
    console.error(`[TOOL ERROR] ${toolName} (${kind}):`, rawMsg);

    // ----------------------------------------------------------
    // P0-03: Write tools must NEVER pretend success on infra error.
    // Return a clearly-marked graceful-fail so the LLM tells the
    // customer the truth ("we couldn't save it — call the branch
    // or retry") instead of silently dropping the booking.
    // ----------------------------------------------------------
    if (WRITE_TOOLS.has(toolName)) {
      const failureRef = `FAIL-${Date.now().toString(36).toUpperCase()}`;
      return {
        success: false,
        write_persisted: false,        // explicit: nothing was saved
        error_category: kind,          // 'transient' | 'database' | 'unknown'
        retry_advised: kind === 'transient',
        failure_ref: failureRef,       // for log correlation / customer support
        customer_phone: customerPhone, // so the branch can call back
        // Arabic message for the LLM to paraphrase to the customer.
        // The key property is `write_persisted: false` — the LLM must not
        // claim the booking/ticket/inquiry was saved.
        message: kind === 'transient'
          ? 'معذرة، صار في بطء مؤقت في السيستم وما قدرنا نحفظ طلبك هلأ. جرب مرة ثانية بعد شوي، أو اتصل بالفرع مباشرة ونسجله يدوياً. ما ضاع شي من معلوماتك.'
          : 'معذرة، في مشكلة تقنية في حفظ الطلب هلأ. خذ رقم الفرع من get_branch_info واتصل فيهم وبيسجلولك الطلب يدوياً. آسفين على الإزعاج.',
        // Internal-only diagnostic the LLM should NOT read to the customer.
        // Present so admin dashboards can display the real cause.
        _diagnostic: rawMsg,
      };
    }

    // Read tools: short, generic failure is fine — the LLM will re-try or
    // tell the customer it couldn't look something up.
    return {
      success: false,
      error_category: kind,
      error: rawMsg,
    };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool, WRITE_TOOLS, classifyError };
