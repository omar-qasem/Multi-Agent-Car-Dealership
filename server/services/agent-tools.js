/**
 * أوتو جوردن - Agent Tools
 * AI Agent Function Calling Tools for Car Dealership
 */

const db = require('../database/db');

// =============================================
// Tool Definitions (for Groq Function Calling)
// =============================================
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_cars',
      description: 'البحث عن سيارات متاحة في معرض أوتو جوردن. استخدم هذه الأداة لما العميل يسأل عن سيارة معينة أو يبحث عن سيارة بمواصفات محددة.',
      parameters: {
        type: 'object',
        properties: {
          make: { type: 'string', description: 'الماركة مثل Toyota أو Hyundai أو Kia أو MG' },
          model: { type: 'string', description: 'الموديل مثل Camry أو Tucson أو Sportage' },
          year: { type: 'number', description: 'سنة الصنع' },
          min_price: { type: 'number', description: 'الحد الأدنى للسعر بالدينار الأردني' },
          max_price: { type: 'number', description: 'الحد الأقصى للسعر بالدينار الأردني' },
          condition: { type: 'string', enum: ['new', 'used', 'all'], description: 'جديدة أو مستعملة' },
          branch: { type: 'string', description: 'الفرع: عمان، إربد، الزرقاء، العقبة' },
          fuel_type: { type: 'string', description: 'نوع الوقود: بنزين، هجين، كهربائي' },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_parts_inventory',
      description: 'فحص توفر قطعة غيار في المخزون. استخدم هذه الأداة لما العميل يسأل عن قطعة غيار.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'اسم القطعة مثل: فلتر زيت، بريك باد، بطارية، إطارات' },
          car_make: { type: 'string', description: 'ماركة السيارة' },
          car_model: { type: 'string', description: 'موديل السيارة' },
          part_number: { type: 'string', description: 'رقم القطعة إذا معروف' },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_branch_availability',
      description: 'التحقق من توفر مواعيد في فرع معين في تاريخ محدد قبل الحجز. استدعها دائماً بعد جمع الفرع والتاريخ وقبل استدعاء book_maintenance. تُعيد عدد الحجوزات الحالية، الفترات المتاحة، وهل الفرع مليء أم لا.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'الفرع: عمان، إربد، الزرقاء، العقبة' },
          date: { type: 'string', description: 'التاريخ بصيغة YYYY-MM-DD' },
        },
        required: ['branch', 'date'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'book_maintenance',
      description: 'حجز موعد صيانة لعميل. استدعها فقط بعد جمع جميع الحقول المطلوبة: نوع الخدمة، ماركة السيارة، موديل السيارة، التاريخ المفضل، والفرع. إذا كان أي حقل ناقص اسأل العميل أولاً ولا تستدعي هذه الأداة. يجب استدعاء check_branch_availability قبلها للتأكد من توفر الفرع.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'اسم العميل (اختياري - لو ما ذكره استخدم رقمه)' },
          car_make: { type: 'string', description: 'ماركة السيارة مثل Toyota أو Hyundai (مطلوب)' },
          car_model: { type: 'string', description: 'موديل السيارة مثل Camry أو Tucson (مطلوب)' },
          car_year: { type: 'number', description: 'سنة السيارة (اختياري)' },
          service_type: {
            type: 'string',
            description: 'نوع الخدمة (مطلوب): تغيير زيت، صيانة دورية، فحص شامل، إطارات، بريك، كهربائي، تبريد، أو أخرى'
          },
          preferred_date: { type: 'string', description: 'التاريخ المفضل بصيغة YYYY-MM-DD (مطلوب)' },
          preferred_time: { type: 'string', description: 'الوقت المفضل' },
          branch: { type: 'string', description: 'الفرع (مطلوب): عمان، إربد، الزرقاء، العقبة' },
          notes: { type: 'string', description: 'ملاحظات إضافية' },
        },
        required: ['service_type', 'car_make', 'car_model', 'preferred_date', 'branch'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_promotions',
      description: 'عرض العروض والتخفيضات الحالية في معرض أوتو جوردن.',
      parameters: { type: 'object', properties: {} },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_branch_info',
      description: 'الحصول على معلومات فرع معين أو جميع الأفرع.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'اسم الفرع: عمان، إربد، الزرقاء، العقبة. اتركه فارغاً لعرض جميع الأفرع.' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_service_types',
      description: 'عرض أنواع خدمات الصيانة المتاحة وأسعارها التقريبية.',
      parameters: { type: 'object', properties: {} },
    },
  },

  {
    type: 'function',
    function: {
      name: 'submit_support_ticket',
      description: 'إنشاء تذكرة دعم وتحويل العميل لموظف بشري. استدعها فور ما يطلب العميل التحدث مع شخص حقيقي أو تفشل المعالجة الذكية.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'اسم العميل (اختياري)' },
          issue_description: { type: 'string', description: 'وصف مختصر للطلب أو المشكلة' },
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
      description: 'تسجيل استفسار شراء سيارة من عميل مهتم. استدعها فقط بعد: (1) عرض نتائج search_cars للعميل و(2) تأكيد اهتمامه الجدي بسيارة معينة أو بالشراء عموماً. لا تستدعيها مباشرةً عند أول ذكر للشراء — ابدأ بـ search_cars دائماً.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'اسم العميل (اختياري)' },
          car_make: { type: 'string', description: 'ماركة السيارة المطلوبة (اختياري)' },
          car_model: { type: 'string', description: 'موديل السيارة المطلوبة (اختياري)' },
          budget: { type: 'number', description: 'الميزانية بالدينار الأردني (اختياري)' },
          notes: { type: 'string', description: 'ملاحظات إضافية عن المواصفات المطلوبة' },
        },
        required: [],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_customer_bookings',
      description: 'عرض مواعيد الصيانة السابقة والقادمة للعميل.',
      parameters: { type: 'object', properties: {} },
    },
  },

  {
    type: 'function',
    function: {
      name: 'calculate_financing',
      description: 'حساب قسط التمويل الشهري لشراء سيارة بالتقسيط. استخدم هذه الأداة لما العميل يسأل عن التقسيط أو كم يكون القسط الشهري.',
      parameters: {
        type: 'object',
        properties: {
          car_price: { type: 'number', description: 'سعر السيارة الكامل بالدينار الأردني' },
          down_payment: { type: 'number', description: 'مبلغ الدفعة الأولى بالدينار الأردني' },
          months: {
            type: 'number',
            enum: [12, 24, 36, 48, 60],
            description: 'مدة التمويل بالأشهر: 12 أو 24 أو 36 أو 48 أو 60 شهراً',
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
      description: 'مقارنة سيارتين جنباً إلى جنب من حيث المواصفات والسعر والميزات. استخدم هذه الأداة لما العميل يريد يقارن بين سيارتين.',
      parameters: {
        type: 'object',
        properties: {
          make1: { type: 'string', description: 'ماركة السيارة الأولى' },
          model1: { type: 'string', description: 'موديل السيارة الأولى' },
          make2: { type: 'string', description: 'ماركة السيارة الثانية' },
          model2: { type: 'string', description: 'موديل السيارة الثانية' },
        },
        required: ['make1', 'model1', 'make2', 'model2'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'التحقق من توفر سيارة معينة في المعرض مع عدد النسخ المتاحة والألوان والفروع. أدق من search_cars لما العميل يسأل "هل عندكم؟" أو "كم واحدة عندكم؟"',
      parameters: {
        type: 'object',
        properties: {
          make: { type: 'string', description: 'ماركة السيارة' },
          model: { type: 'string', description: 'موديل السيارة' },
          year: { type: 'number', description: 'سنة الصنع (اختياري)' },
          branch: { type: 'string', description: 'فرع محدد للتحقق (اختياري): عمان، إربد، الزرقاء، العقبة' },
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
        const TIME_SLOTS = ['8:00 ص', '9:00 ص', '10:00 ص', '11:00 ص', '12:00 م', '1:00 م', '2:00 م', '3:00 م', '4:00 م', '5:00 م', '6:00 م', '7:00 م'];

        const existingBookings = await db.getBookingsByBranchAndDate(branch, date);
        const bookedCount = existingBookings.length;
        const isFull = bookedCount >= MAX_DAILY_BOOKINGS;

        // Build rough list of taken time slots from bookings
        const takenSlots = new Set(existingBookings.map(b => b.preferred_time).filter(Boolean));
        const availableSlots = TIME_SLOTS.filter(s => !takenSlots.has(s));

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
          available_time_slots: availableSlots,
          message: `فرع ${branch} متوفر بتاريخ ${date}. ${MAX_DAILY_BOOKINGS - bookedCount} مواعيد متاحة.`,
        };
      }

      case 'book_maintenance': {
        // Hard-validate all required fields — the LLM should have collected them via conversation
        const missing = [];
        if (!args.car_make  || args.car_make.trim()  === '') missing.push('ماركة السيارة (مثلاً: Toyota)');
        if (!args.car_model || args.car_model.trim() === '') missing.push('موديل السيارة (مثلاً: Camry)');
        if (!args.branch    || args.branch.trim()    === '') missing.push('الفرع (عمان، إربد، الزرقاء، العقبة)');

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

        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;

        await db.upsertCustomer(customerPhone, {
          name: customerName,
          car_make: args.car_make,
          car_model: args.car_model,
        });

        const booking = await db.createBooking({
          customer_phone:  customerPhone,
          customer_name:   customerName,
          car_make:        args.car_make,
          car_model:       args.car_model,
          car_year:        args.car_year || null,
          service_type:    args.service_type,
          preferred_date:  args.preferred_date,
          preferred_time:  args.preferred_time || '9:00 صباحاً',
          branch:          args.branch,
          notes:           args.notes || '',
        });

        return {
          success: true,
          booking_id: booking.id,
          message: 'تم الحجز بنجاح! سيتصل بكم فريقنا خلال ساعات لتأكيد الموعد.',
          details: {
            booking_id: booking.id,
            service:    booking.service_type,
            date:       booking.preferred_date,
            time:       booking.preferred_time,
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

      case 'get_service_types': {
        return {
          success: true,
          services: [
            { name: 'تغيير زيت + فلتر', price: '25-35 دينار', duration: '45 دقيقة' },
            { name: 'صيانة دورية (10,000 كم)', price: '45-75 دينار', duration: '1.5-2 ساعة' },
            { name: 'صيانة دورية (20,000 كم)', price: '80-120 دينار', duration: '2-3 ساعات' },
            { name: 'فحص شامل 21 نقطة', price: 'مجاني مع كل صيانة', duration: '30 دقيقة' },
            { name: 'تغيير إطارات', price: '8-12 دينار للإطار', duration: '30-45 دقيقة' },
            { name: 'فحص وتصليح بريك', price: '35-85 دينار', duration: '1-2 ساعة' },
            { name: 'فحص كهربائي', price: '20-50 دينار', duration: '30-90 دقيقة' },
            { name: 'تعبئة غاز مكيف', price: '25-40 دينار', duration: '45 دقيقة' },
            { name: 'سمكرة ودهان', price: 'حسب الحجم والضرر', duration: 'يوم - أسبوع' },
          ],
        };
      }

      case 'submit_support_ticket': {
        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;
        await db.upsertCustomer(customerPhone, { name: customerName });

        const ticket = await db.createTicket({
          customer_phone:    customerPhone,
          customer_name:     customerName,
          issue_description: args.issue_description,
          priority:          args.priority || 'medium',
        });

        return {
          success: true,
          ticket_id: ticket.id,
          message: 'تم إنشاء التذكرة بنجاح. سيتواصل معك أحد موظفينا خلال ساعة.',
          details: { ticket_id: ticket.id, priority: ticket.priority },
        };
      }

      case 'create_purchase_inquiry': {
        const customerName = args.customer_name || `عميل ${customerPhone.slice(-4)}`;
        await db.upsertCustomer(customerPhone, { name: customerName });

        const inquiry = await db.createInquiry({
          customer_phone: customerPhone,
          customer_name:  customerName,
          car_make:       args.car_make || '',
          car_model:      args.car_model || '',
          budget:         args.budget || null,
          notes:          args.notes || '',
        });

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
    console.error(`[TOOL ERROR] ${toolName}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
