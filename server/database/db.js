/**
 * أوتو جوردن - Database Layer (v2 — Unified Persistence)
 * Auto Jordan Car Dealership Database
 *
 * ────────────────────────────────────────────────────────────────
 *  DESIGN RULES
 * ────────────────────────────────────────────────────────────────
 *  1. Supabase is THE database in production.
 *  2. In-memory is ONLY used when SUPABASE_URL / SUPABASE_SERVICE_KEY
 *     are missing (local dev). Never as a silent fallback on error.
 *  3. When Supabase is configured:
 *        - All operations go to Supabase.
 *        - Errors are LOGGED LOUDLY and RE-THROWN so callers see them.
 *        - No silent fallback to in-memory (that caused data-loss bugs).
 *  4. Schema field names match server/database/supabase-schema.sql
 *     exactly — no mapping needed by callers.
 *
 *  All exported functions are ASYNC — use await everywhere.
 */

let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
  console.warn('[DB] ⚠️  @supabase/supabase-js not installed — using in-memory fallback');
  createClient = null;
}

// =============================================
// Supabase Client
// =============================================
let supabase = null;
let useSupabase = false;

const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const isNetlify = !!process.env.NETLIFY;

if (createClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
  useSupabase = true;
  console.log('[DB] ✅ Supabase connected — data persists across instances');
} else {
  if (isProduction || isNetlify) {
    console.error('[DB] ❌ CRITICAL: SUPABASE_URL / SUPABASE_SERVICE_KEY missing in production!');
    console.error('[DB] ❌ Using in-memory fallback — DATA WILL BE LOST on every cold start!');
    console.error('[DB] ❌ Set both env vars in Netlify site settings and redeploy.');
  } else {
    console.warn('[DB] ⚠️  Supabase env vars missing — using in-memory fallback (dev mode)');
  }
}

// =============================================
// In-Memory Fallback (dev-only)
// =============================================
const mem = {
  customers: new Map(),
  cars: [],
  parts: [],
  bookings: [],
  tickets: [],
  inquiries: [],
  promotions: [],
  messages: [],
  counters: { customers: 1, cars: 100, parts: 100, bookings: 1000, tickets: 2000, inquiries: 3000, messages: 10000 },
};

const BRANCHES = [
  { id: 1, name: 'عمان - الرئيسي', address: 'شارع المدينة المنورة، عمان', phone: '06-5000001', hours_weekday: '8ص-8م', hours_friday: '8ص-2م', hours_saturday: '8ص-6م', services: ['بيع سيارات', 'صيانة', 'قطع غيار', 'سمكرة ودهان'] },
  { id: 2, name: 'إربد',            address: 'شارع الجامعة، إربد',        phone: '02-7200001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
  { id: 3, name: 'الزرقاء',         address: 'شارع الأمير محمد، الزرقاء',  phone: '05-3900001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
  { id: 4, name: 'العقبة',          address: 'شارع الملك الحسين، العقبة',  phone: '03-2010001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
];

function seedMemory() {
  mem.cars = [
    { id: 1,  make: 'Toyota',  model: 'Camry',        year: 2024, color: 'أبيض لؤلؤي', price: 18500, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'كاميرا خلفية، شاشة لمس، كروز كنترول، نظام ملاحة', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 2,  make: 'Toyota',  model: 'Camry',        year: 2024, color: 'أسود',        price: 18500, mileage: 0,     condition: 'new',  status: 'available', branch: 'إربد',    features: 'كاميرا خلفية، شاشة لمس، كروز كنترول',             fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 3,  make: 'Toyota',  model: 'Land Cruiser', year: 2023, color: 'أبيض',        price: 58000, mileage: 35000, condition: 'used', status: 'available', branch: 'عمان',    features: 'فل أوبشن، 4WD، 7 مقاعد، نظام ملاحة',               fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '4.0L' },
    { id: 4,  make: 'Toyota',  model: 'Corolla',      year: 2024, color: 'فضي',         price: 14500, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'كاميرا خلفية، بلوتوث، مكيف',                        fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 5,  make: 'Toyota',  model: 'Corolla',      year: 2022, color: 'أبيض',        price: 11800, mileage: 42000, condition: 'used', status: 'available', branch: 'الزرقاء', features: 'بلوتوث، مكيف، كاميرا خلفية',                        fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 6,  make: 'Toyota',  model: 'RAV4',         year: 2024, color: 'أحمر',        price: 22000, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'AWD، شاشة لمس، كاميرا 360',                         fuel_type: 'هجين',  transmission: 'أوتوماتيك', engine: '2.5L Hybrid' },
    { id: 7,  make: 'Hyundai', model: 'Tucson',       year: 2024, color: 'رمادي',       price: 16800, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'بانورامك، شاشة لمس، كاميرا 360، كروز',            fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
    { id: 8,  make: 'Hyundai', model: 'Elantra',      year: 2024, color: 'أزرق',        price: 13200, mileage: 0,     condition: 'new',  status: 'available', branch: 'إربد',    features: 'كاميرا خلفية، بلوتوث، شاشة لمس',                   fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 9,  make: 'Hyundai', model: 'Santa Fe',     year: 2023, color: 'أسود',        price: 28500, mileage: 18000, condition: 'used', status: 'available', branch: 'عمان',    features: '7 مقاعد، AWD، فل أوبشن',                           fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5T' },
    { id: 10, make: 'Kia',     model: 'Sportage',     year: 2024, color: 'أبيض',        price: 17200, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'بانورامك، كاميرا 360، شاشة 12 بوصة',               fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
    { id: 11, make: 'Kia',     model: 'Cerato',       year: 2024, color: 'رمادي',       price: 12800, mileage: 0,     condition: 'new',  status: 'available', branch: 'الزرقاء', features: 'كاميرا خلفية، شاشة لمس، بلوتوث',                   fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 12, make: 'MG',      model: 'ZS',           year: 2024, color: 'أبيض',        price: 12500, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'شاشة لمس كبيرة، كاميرا خلفية، كروز',              fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.5T' },
    { id: 13, make: 'MG',      model: 'HS',           year: 2024, color: 'رمادي',       price: 15800, mileage: 0,     condition: 'new',  status: 'available', branch: 'عمان',    features: 'بانورامك، كاميرا 360، AWD',                        fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.0T' },
    { id: 14, make: 'Nissan',  model: 'Sunny',        year: 2024, color: 'أبيض',        price: 9800,  mileage: 0,     condition: 'new',  status: 'available', branch: 'العقبة',  features: 'مكيف، بلوتوث، كاميرا خلفية',                        fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.5L' },
    { id: 15, make: 'Nissan',  model: 'Altima',       year: 2023, color: 'أسود',        price: 16500, mileage: 22000, condition: 'used', status: 'available', branch: 'عمان',    features: 'كروز، كاميرا خلفية، شاشة لمس',                      fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 16, make: 'BMW',     model: '320i',         year: 2022, color: 'أبيض',        price: 32000, mileage: 28000, condition: 'used', status: 'available', branch: 'عمان',    features: 'فل أوبشن، نظام ملاحة، جلد',                         fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.0T' },
    { id: 17, make: 'Chery',   model: 'Tiggo 8 Pro',  year: 2024, color: 'أبيض',        price: 14800, mileage: 0,     condition: 'new',  status: 'available', branch: 'إربد',    features: '7 مقاعد، بانورامك، شاشة كبيرة',                    fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
  ];
  mem.counters.cars = mem.cars.length + 1;

  mem.parts = [
    { id: 1,  name: 'فلتر زيت',             part_number: 'OIL-TOY-001',  compatible: ['Toyota Camry', 'Toyota Corolla', 'Toyota RAV4'],      quantity: 45, min_quantity: 10, price: 8,   location: 'رف A1', category: 'فلاتر' },
    { id: 2,  name: 'فلتر زيت',             part_number: 'OIL-HYU-001',  compatible: ['Hyundai Tucson', 'Hyundai Elantra', 'Hyundai Santa Fe'], quantity: 32, min_quantity: 10, price: 7,   location: 'رف A2', category: 'فلاتر' },
    { id: 3,  name: 'فلتر هواء',            part_number: 'AIR-TOY-001',  compatible: ['Toyota Camry', 'Toyota Corolla'],                     quantity: 20, min_quantity: 10, price: 12,  location: 'رف A3', category: 'فلاتر' },
    { id: 4,  name: 'فلتر هواء',            part_number: 'AIR-KIA-001',  compatible: ['Kia Sportage', 'Kia Cerato'],                         quantity: 15, min_quantity: 10, price: 11,  location: 'رف A4', category: 'فلاتر' },
    { id: 5,  name: 'فلتر مكيف',            part_number: 'CAB-TOY-001',  compatible: ['Toyota Camry', 'Toyota Corolla', 'Toyota RAV4'],      quantity: 28, min_quantity: 10, price: 9,   location: 'رف A5', category: 'فلاتر' },
    { id: 6,  name: 'بطارية 60 أمبير',      part_number: 'BAT-60-001',   compatible: ['Nissan Sunny', 'Hyundai Elantra', 'Kia Cerato'],      quantity: 8,  min_quantity: 5,  price: 65,  location: 'رف B1', category: 'بطاريات' },
    { id: 7,  name: 'بطارية 75 أمبير',      part_number: 'BAT-75-001',   compatible: ['Toyota Camry', 'Toyota Corolla', 'Hyundai Tucson'],   quantity: 12, min_quantity: 5,  price: 85,  location: 'رف B2', category: 'بطاريات' },
    { id: 8,  name: 'بطارية 90 أمبير',      part_number: 'BAT-90-001',   compatible: ['Toyota Land Cruiser', 'Hyundai Santa Fe', 'BMW 320i'],quantity: 5,  min_quantity: 3,  price: 110, location: 'رف B3', category: 'بطاريات' },
    { id: 9,  name: 'بريك باد أمامي',       part_number: 'BRK-TOY-F001', compatible: ['Toyota Camry', 'Toyota Corolla'],                     quantity: 18, min_quantity: 6,  price: 35,  location: 'رف C1', category: 'بريك' },
    { id: 10, name: 'بريك باد خلفي',        part_number: 'BRK-TOY-R001', compatible: ['Toyota Camry', 'Toyota Corolla'],                     quantity: 14, min_quantity: 6,  price: 28,  location: 'رف C2', category: 'بريك' },
    { id: 11, name: 'بريك باد أمامي',       part_number: 'BRK-HYU-F001', compatible: ['Hyundai Tucson', 'Hyundai Elantra'],                  quantity: 10, min_quantity: 5,  price: 32,  location: 'رف C3', category: 'بريك' },
    { id: 12, name: 'قرص بريك أمامي',       part_number: 'DSC-TOY-F001', compatible: ['Toyota Camry', 'Toyota RAV4'],                        quantity: 6,  min_quantity: 3,  price: 55,  location: 'رف C4', category: 'بريك' },
    { id: 13, name: 'إطار 195/65R15',       part_number: 'TYR-195-65-15',compatible: ['Toyota Corolla', 'Hyundai Elantra', 'Kia Cerato'],    quantity: 16, min_quantity: 8,  price: 45,  location: 'رف D1', category: 'إطارات' },
    { id: 14, name: 'إطار 215/55R17',       part_number: 'TYR-215-55-17',compatible: ['Toyota Camry', 'Hyundai Tucson', 'Kia Sportage'],     quantity: 20, min_quantity: 8,  price: 62,  location: 'رف D2', category: 'إطارات' },
    { id: 15, name: 'إطار 265/70R17',       part_number: 'TYR-265-70-17',compatible: ['Toyota Land Cruiser', 'Hyundai Santa Fe'],            quantity: 8,  min_quantity: 4,  price: 95,  location: 'رف D3', category: 'إطارات' },
    { id: 16, name: 'شمعات NGK (طقم)',      part_number: 'SPK-NGK-001',  compatible: ['Toyota Camry', 'Toyota Corolla', 'Nissan Sunny'],     quantity: 25, min_quantity: 8,  price: 22,  location: 'رف E1', category: 'شمعات' },
    { id: 17, name: 'شمعات بوش (طقم)',      part_number: 'SPK-BSH-001',  compatible: ['Hyundai Tucson', 'Kia Sportage', 'BMW 320i'],         quantity: 15, min_quantity: 6,  price: 28,  location: 'رف E2', category: 'شمعات' },
    { id: 18, name: 'زيت محرك 5W-30 (4L)',  part_number: 'OIL-5W30-4L',  compatible: ['جميع السيارات'],                                       quantity: 60, min_quantity: 15, price: 18,  location: 'رف F1', category: 'زيوت' },
    { id: 19, name: 'زيت محرك 0W-20 (4L)',  part_number: 'OIL-0W20-4L',  compatible: ['Toyota Camry 2020+', 'Toyota RAV4 Hybrid'],           quantity: 30, min_quantity: 10, price: 24,  location: 'رف F2', category: 'زيوت' },
  ];
  mem.counters.parts = mem.parts.length + 1;

  mem.promotions = [
    { id: 1, title: 'عرض رمضان الكريم 🌙',     description: 'خصم 500 دينار على جميع السيارات الجديدة + 3 سنوات كفالة مجانية', valid_until: '2026-04-30', applies_to: 'جميع السيارات الجديدة', active: true },
    { id: 2, title: 'عرض فحص مجاني',          description: 'فحص شامل مجاني 21 نقطة مع كل موعد صيانة',                        valid_until: '2026-06-30', applies_to: 'جميع العملاء',           active: true },
    { id: 3, title: 'تقسيط بدون فوائد',       description: 'تقسيط حتى 60 شهراً بدون فوائد على سيارات MG و Chery',            valid_until: '2026-05-31', applies_to: 'MG & Chery',             active: true },
    { id: 4, title: 'استبدال سيارتك القديمة', description: 'نشتري سيارتك القديمة بأفضل سعر ونستبدلها بجديدة',                valid_until: '2026-12-31', applies_to: 'جميع العملاء',           active: true },
  ];
}

// =============================================
// Conversation States Availability Flag
// =============================================
// Set to true once initDatabase() confirms the table exists.
// When false, getConversationState returns null and saves are silently
// skipped so the system works without multi-turn memory rather than
// crashing on every request.
let conversationStatesAvailable = false;

// =============================================
// Supabase Error Handling Helper
// =============================================
/**
 * Standardised Supabase error handler.
 * In production / when Supabase is configured, errors are THROWN so routes
 * can respond with HTTP 500 and Netlify logs show the real cause.
 * Previously errors were swallowed silently, and functions fell through to
 * the empty in-memory store — making bookings / messages "disappear".
 */
function sbThrow(operation, error) {
  const msg = `[DB] Supabase ${operation} failed: ${error?.message || error}`;
  console.error(msg, error);
  const err = new Error(msg);
  err.code = error?.code;
  err.details = error?.details;
  err.hint = error?.hint;
  throw err;
}

// =============================================
// Initialize Database
// =============================================
// IMPORTANT: When Supabase env vars are set, we NEVER silently fall back
// to in-memory. A connection or schema failure at this point is always a
// deployment issue (missing schema, wrong key, wrong project URL) and
// hiding it would cause data-loss bugs identical to the ones the v2
// rewrite was supposed to fix. We log a big, obvious banner and keep
// useSupabase=true so every subsequent call throws with a clear error.
async function initDatabase() {
  if (useSupabase) {
    const { error } = await supabase.from('cars').select('id').limit(1);
    if (error) {
      console.error('');
      console.error('╔══════════════════════════════════════════════════════════════════╗');
      console.error('║  ❌ SUPABASE SCHEMA CHECK FAILED — DEPLOYMENT NOT READY          ║');
      console.error('╠══════════════════════════════════════════════════════════════════╣');
      console.error('║  The "cars" table is missing or unreachable.                     ║');
      console.error('║                                                                  ║');
      console.error('║  FIX (one-time):                                                 ║');
      console.error('║    1. Open https://supabase.com/dashboard                        ║');
      console.error('║    2. Select your project  →  SQL Editor  →  New query          ║');
      console.error('║    3. Paste the contents of                                      ║');
      console.error('║       server/database/supabase-schema.sql                        ║');
      console.error('║    4. Run the query.  All 8 tables will be created.              ║');
      console.error('║                                                                  ║');
      console.error('║  Also check:                                                     ║');
      console.error('║    • SUPABASE_URL points to the right project                    ║');
      console.error('║    • SUPABASE_SERVICE_KEY is the service_role key (not anon)    ║');
      console.error('╚══════════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error('[DB] Supabase error detail:', error.message, error.details || '', error.hint || '');
      console.error('[DB] Every DB call will now throw until this is fixed. NO silent fallback.');
      // DO NOT set useSupabase = false. DO NOT call seedMemory().
      // Callers must see the real error, not fake success.
      return;
    }
    console.log('[DB] ✅ Supabase schema ready — persistent mode active');

    // Check conversation_states table (optional migration — graceful degradation if missing)
    const { error: csErr } = await supabase.from('conversation_states').select('phone_number').limit(1);
    if (csErr && (csErr.code === 'PGRST205' || csErr.code === '42P01')) {
      console.error('');
      console.error('╔═════════════════════════════════════════════════════════════════╗');
      console.error('║  ⚠️  MIGRATION MISSING — conversation_states table not found    ║');
      console.error('║  Multi-turn memory DISABLED until migration runs.               ║');
      console.error('║                                                                 ║');
      console.error('║  FIX: Run in Supabase SQL Editor:                               ║');
      console.error('║    server/database/migrations/001_conversation_states.sql       ║');
      console.error('╚═════════════════════════════════════════════════════════════════╝');
      console.error('');
      // DO NOT throw — system continues working, just without conversation memory
    } else if (!csErr) {
      conversationStatesAvailable = true;
      console.log('[DB] ✅ conversation_states table ready — multi-turn memory active');
    }

    return;
  }

  // Env vars not set at all → dev mode with in-memory seed data.
  seedMemory();
  conversationStatesAvailable = true; // in-memory always supports it
  console.log(`[DB] 🚗 In-memory dev mode: ${mem.cars.length} cars | 🔧 ${mem.parts.length} parts | 🎯 ${mem.promotions.length} promotions`);
  console.log('[DB] ⚠️  Set SUPABASE_URL and SUPABASE_SERVICE_KEY for production persistence.');
}

// =============================================
// Health check helper — exposed for /health endpoint & dashboard
// =============================================
function getDbMode() {
  if (!useSupabase) return { mode: 'in-memory', persistent: false };
  return { mode: 'supabase', persistent: true };
}

// =============================================
// CARS
// =============================================
async function searchCars(filters = {}) {
  const maxResults = filters.limit || 10; // Default 10; callers can override (e.g. check_availability uses 50)
  if (useSupabase) {
    let q = supabase.from('cars').select('*');
    // Allow callers to opt out of the status filter (for availability counts)
    if (filters.status !== 'all') q = q.eq('status', filters.status || 'available');
    if (filters.make)      q = q.ilike('make', `%${filters.make}%`);
    if (filters.model)     q = q.ilike('model', `%${filters.model}%`);
    if (filters.year)      q = q.eq('year', parseInt(filters.year));
    if (filters.min_price) q = q.gte('price', filters.min_price);
    if (filters.max_price) q = q.lte('price', filters.max_price);
    if (filters.branch)    q = q.ilike('branch', `%${filters.branch}%`);
    if (filters.fuel_type) q = q.ilike('fuel_type', `%${filters.fuel_type}%`);
    const { data, error } = await q.limit(maxResults);
    if (error) sbThrow('searchCars', error);
    return data || [];
  }
  let results = mem.cars;
  if (filters.status !== 'all') results = results.filter(c => c.status === (filters.status || 'available'));
  if (filters.make)      results = results.filter(c => c.make.toLowerCase().includes(filters.make.toLowerCase()));
  if (filters.model)     results = results.filter(c => c.model.toLowerCase().includes(filters.model.toLowerCase()));
  if (filters.year)      results = results.filter(c => c.year === parseInt(filters.year));
  if (filters.min_price) results = results.filter(c => c.price >= filters.min_price);
  if (filters.max_price) results = results.filter(c => c.price <= filters.max_price);
  if (filters.branch)    results = results.filter(c => (c.branch || '').includes(filters.branch));
  if (filters.fuel_type) results = results.filter(c => (c.fuel_type || '').includes(filters.fuel_type));
  return results.slice(0, maxResults);
}

async function getCarById(id) {
  if (useSupabase) {
    const { data, error } = await supabase.from('cars').select('*').eq('id', id).maybeSingle();
    if (error) sbThrow('getCarById', error);
    return data;
  }
  return mem.cars.find(c => String(c.id) === String(id)) || null;
}

async function getAllCars() {
  if (useSupabase) {
    const { data, error } = await supabase.from('cars').select('*').order('created_at', { ascending: false });
    if (error) sbThrow('getAllCars', error);
    return data || [];
  }
  return [...mem.cars].sort((a, b) => b.id - a.id);
}

async function addCar(data) {
  const payload = { status: 'available', ...data };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('cars').insert([payload]).select().single();
    if (error) sbThrow('addCar', error);
    return row;
  }
  const car = { id: mem.counters.cars++, ...payload, created_at: new Date().toISOString() };
  mem.cars.push(car);
  return car;
}

async function updateCar(id, data) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  delete payload.id;
  delete payload.created_at;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('cars').update(payload).eq('id', id).select().single();
    if (error) sbThrow('updateCar', error);
    return row;
  }
  const idx = mem.cars.findIndex(c => String(c.id) === String(id));
  if (idx === -1) return null;
  mem.cars[idx] = { ...mem.cars[idx], ...payload };
  return mem.cars[idx];
}

async function deleteCar(id) {
  if (useSupabase) {
    const { error } = await supabase.from('cars').delete().eq('id', id);
    if (error) sbThrow('deleteCar', error);
    return true;
  }
  const idx = mem.cars.findIndex(c => String(c.id) === String(id));
  if (idx === -1) return false;
  mem.cars.splice(idx, 1);
  return true;
}

// =============================================
// PARTS
// =============================================
async function searchParts(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('parts').select('*');
    if (filters.name) q = q.or(`name.ilike.%${filters.name}%,category.ilike.%${filters.name}%`);
    if (filters.part_number) q = q.ilike('part_number', `%${filters.part_number}%`);
    const { data, error } = await q.limit(6);
    if (error) sbThrow('searchParts', error);

    // Client-side compatibility filter (TEXT[] array)
    let results = data || [];
    if (filters.car_make || filters.car_model) {
      const search = `${filters.car_make || ''} ${filters.car_model || ''}`.trim().toLowerCase();
      results = results.filter(p =>
        (Array.isArray(p.compatible) ? p.compatible : []).some(c =>
          c.toLowerCase().includes(search) || (search && search.includes(c.toLowerCase().split(' ')[0]))
        ) || (Array.isArray(p.compatible) && p.compatible.includes('جميع السيارات'))
      );
    }
    return results;
  }

  let results = mem.parts;
  if (filters.name) results = results.filter(p =>
    p.name.toLowerCase().includes(filters.name.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(filters.name.toLowerCase())
  );
  if (filters.part_number) results = results.filter(p => (p.part_number || '').toLowerCase().includes(filters.part_number.toLowerCase()));
  if (filters.car_make || filters.car_model) {
    const search = `${filters.car_make || ''} ${filters.car_model || ''}`.trim().toLowerCase();
    results = results.filter(p =>
      (Array.isArray(p.compatible) ? p.compatible : []).some(c =>
        c.toLowerCase().includes(search) || (search && search.includes(c.toLowerCase().split(' ')[0]))
      ) || (Array.isArray(p.compatible) && p.compatible.includes('جميع السيارات'))
    );
  }
  return results.slice(0, 6);
}

async function getAllParts() {
  if (useSupabase) {
    const { data, error } = await supabase.from('parts').select('*').order('name');
    if (error) sbThrow('getAllParts', error);
    return data || [];
  }
  return [...mem.parts].sort((a, b) => a.name.localeCompare(b.name));
}

async function updatePart(id, data) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  delete payload.id;
  delete payload.created_at;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('parts').update(payload).eq('id', id).select().single();
    if (error) sbThrow('updatePart', error);
    return row;
  }
  const idx = mem.parts.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return null;
  mem.parts[idx] = { ...mem.parts[idx], ...payload };
  return mem.parts[idx];
}

async function addPart(data) {
  const payload = { quantity: 0, ...data };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('parts').insert([payload]).select().single();
    if (error) sbThrow('addPart', error);
    return row;
  }
  const part = { id: mem.counters.parts++, ...payload, created_at: new Date().toISOString() };
  mem.parts.push(part);
  return part;
}

// =============================================
// CUSTOMERS
// =============================================
async function getCustomer(phone) {
  if (useSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('phone', phone).maybeSingle();
    if (error) sbThrow('getCustomer', error);
    return data || null;
  }
  return mem.customers.get(phone) || null;
}

async function upsertCustomer(phone, data) {
  if (useSupabase) {
    const existing = await getCustomer(phone);
    if (existing) {
      const payload = { ...data, updated_at: new Date().toISOString() };
      delete payload.id;
      delete payload.phone;
      delete payload.created_at;
      const { data: row, error } = await supabase.from('customers').update(payload).eq('phone', phone).select().single();
      if (error) sbThrow('upsertCustomer.update', error);
      return row;
    }
    const payload = { phone, ...data };
    delete payload.id;
    delete payload.created_at;
    const { data: row, error } = await supabase.from('customers').insert([payload]).select().single();
    if (error) sbThrow('upsertCustomer.insert', error);
    return row;
  }
  const existing = mem.customers.get(phone) || { id: mem.counters.customers++, phone, loyalty_points: 0, created_at: new Date().toISOString() };
  const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
  mem.customers.set(phone, updated);
  return updated;
}

async function getOrCreateCustomer(phone, name) {
  const existing = await getCustomer(phone);
  if (existing) return existing;

  if (useSupabase) {
    const { data: row, error } = await supabase
      .from('customers')
      .insert([{ phone, name: name || phone, loyalty_points: 0 }])
      .select()
      .single();
    if (error) sbThrow('getOrCreateCustomer', error);
    return row;
  }
  const newCustomer = {
    id: mem.counters.customers++,
    phone,
    name: name || phone,
    loyalty_points: 0,
    created_at: new Date().toISOString(),
  };
  mem.customers.set(phone, newCustomer);
  return newCustomer;
}

async function updateCustomerLoyalty(customerId, points) {
  if (useSupabase) {
    // Read-modify-write; avoids schema dependency on RPCs
    const { data: existing, error: readErr } = await supabase
      .from('customers')
      .select('id, loyalty_points')
      .eq('id', customerId)
      .maybeSingle();
    if (readErr) sbThrow('updateCustomerLoyalty.read', readErr);
    if (!existing) {
      console.warn(`[DB] updateCustomerLoyalty: customer ${customerId} not found`);
      return;
    }
    const newPoints = (existing.loyalty_points || 0) + points;
    const { error: updErr } = await supabase
      .from('customers')
      .update({ loyalty_points: newPoints, updated_at: new Date().toISOString() })
      .eq('id', customerId);
    if (updErr) sbThrow('updateCustomerLoyalty.update', updErr);
    return;
  }
  for (const [phone, customer] of mem.customers.entries()) {
    if (String(customer.id) === String(customerId)) {
      customer.loyalty_points = (customer.loyalty_points || 0) + points;
      mem.customers.set(phone, customer);
      break;
    }
  }
}

// =============================================
// BOOKINGS
// =============================================
/**
 * Accepts the exact shape sent by agent-tools.js:
 *   { customer_phone, customer_name, car_make, car_model, car_year,
 *     service_type, preferred_date, preferred_time, branch, notes }
 */
async function createBooking(data) {
  const payload = {
    customer_phone: data.customer_phone || data.phone,
    customer_name:  data.customer_name || null,
    car_make:       data.car_make || null,
    car_model:      data.car_model || null,
    car_year:       data.car_year ? parseInt(data.car_year) : null,
    service_type:   data.service_type || null,
    booking_type:   data.booking_type || 'service',
    preferred_date: data.preferred_date || null,
    preferred_time: data.preferred_time || null,
    branch:         data.branch || 'عمان',
    notes:          data.notes || null,
    status:         'pending',
  };

  if (useSupabase) {
    // Link to customer if present
    if (payload.customer_phone) {
      try {
        const customer = await getOrCreateCustomer(payload.customer_phone, payload.customer_name);
        if (customer?.id) payload.customer_id = customer.id;
      } catch (e) {
        console.warn('[DB] createBooking: could not link customer —', e.message);
      }
    }
    const { data: row, error } = await supabase.from('bookings').insert([payload]).select().single();
    if (error) sbThrow('createBooking', error);
    console.log(`[DB] ✅ Booking saved to Supabase: id=${row.id}`);
    return row;
  }

  const booking = {
    id: `BK-${mem.counters.bookings++}`,
    ...payload,
    created_at: new Date().toISOString(),
  };
  mem.bookings.push(booking);
  return booking;
}

async function getCustomerBookings(phone) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false });
    if (error) sbThrow('getCustomerBookings', error);
    return data || [];
  }
  return mem.bookings.filter(b => b.customer_phone === phone);
}

async function getAllBookings(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.date)   q = q.eq('preferred_date', filters.date);
    if (filters.search) {
      q = q.or(`customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`);
    }
    const { data, error } = await q;
    if (error) sbThrow('getAllBookings', error);
    return data || [];
  }
  let result = [...mem.bookings];
  if (filters.status) result = result.filter(b => b.status === filters.status);
  if (filters.date)   result = result.filter(b => b.preferred_date === filters.date);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(b =>
      (b.customer_name || '').toLowerCase().includes(s) ||
      (b.customer_phone || '').includes(s)
    );
  }
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateBookingStatus(id, status, notes) {
  const payload = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) payload.staff_notes = notes;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('bookings').update(payload).eq('id', id).select().maybeSingle();
    if (error) sbThrow('updateBookingStatus', error);
    return row; // null when id not found — callers handle 404
  }
  const booking = mem.bookings.find(b => String(b.id) === String(id));
  if (!booking) return null;
  Object.assign(booking, payload);
  return booking;
}

// =============================================
// BRANCH AVAILABILITY
// =============================================
async function getBookingsByBranchAndDate(branch, date) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, preferred_time, service_type, customer_name')
      .eq('branch', branch)
      .eq('preferred_date', date)
      .neq('status', 'cancelled');
    if (error) sbThrow('getBookingsByBranchAndDate', error);
    return data || [];
  }
  return mem.bookings.filter(b =>
    b.branch === branch &&
    b.preferred_date === date &&
    b.status !== 'cancelled'
  );
}

// =============================================
// SUPPORT TICKETS
// =============================================
async function createTicket(data) {
  const payload = {
    customer_phone:    data.customer_phone || data.phone,
    customer_name:     data.customer_name || null,
    subject:           (data.issue_description || data.subject || 'طلب دعم').substring(0, 120),
    issue_description: data.issue_description || data.description || '',
    category:          data.category || 'general',
    priority:          data.priority || 'medium',
    status:            'open',
  };

  if (useSupabase) {
    if (payload.customer_phone) {
      try {
        const customer = await getOrCreateCustomer(payload.customer_phone, payload.customer_name);
        if (customer?.id) payload.customer_id = customer.id;
      } catch (e) {
        console.warn('[DB] createTicket: could not link customer —', e.message);
      }
    }
    const { data: row, error } = await supabase.from('support_tickets').insert([payload]).select().single();
    if (error) sbThrow('createTicket', error);
    console.log(`[DB] ✅ Ticket saved to Supabase: id=${row.id}`);
    return row;
  }
  const ticket = {
    id: `TK-${mem.counters.tickets++}`,
    ...payload,
    created_at: new Date().toISOString(),
  };
  mem.tickets.push(ticket);
  return ticket;
}

async function getAllTickets(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (filters.status)   q = q.eq('status', filters.status);
    if (filters.priority) q = q.eq('priority', filters.priority);
    if (filters.search) {
      q = q.or(`customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
    }
    const { data, error } = await q;
    if (error) sbThrow('getAllTickets', error);
    return data || [];
  }
  let result = [...mem.tickets];
  if (filters.status)   result = result.filter(t => t.status === filters.status);
  if (filters.priority) result = result.filter(t => t.priority === filters.priority);
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateTicket(id, data) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  delete payload.id;
  delete payload.created_at;
  if (payload.status === 'resolved' && !payload.resolved_at) {
    payload.resolved_at = new Date().toISOString();
  }

  if (useSupabase) {
    const { data: row, error } = await supabase.from('support_tickets').update(payload).eq('id', id).select().maybeSingle();
    if (error) sbThrow('updateTicket', error);
    return row; // null when id not found — callers handle 404
  }
  const ticket = mem.tickets.find(t => String(t.id) === String(id));
  if (!ticket) return null;
  Object.assign(ticket, payload);
  return ticket;
}

// =============================================
// PURCHASE INQUIRIES
// =============================================
async function createInquiry(data) {
  const payload = {
    customer_phone: data.customer_phone || data.phone,
    customer_name:  data.customer_name || null,
    car_make:       data.car_make || null,
    car_model:      data.car_model || null,
    budget:         data.budget != null ? Number(data.budget) : null,
    financing:      !!data.financing,
    trade_in:       !!data.trade_in,
    timeline:       data.timeline || null,
    notes:          data.notes || null,
    status:         'new',
  };

  if (useSupabase) {
    if (payload.customer_phone) {
      try {
        const customer = await getOrCreateCustomer(payload.customer_phone, payload.customer_name);
        if (customer?.id) payload.customer_id = customer.id;
      } catch (e) {
        console.warn('[DB] createInquiry: could not link customer —', e.message);
      }
    }
    const { data: row, error } = await supabase.from('purchase_inquiries').insert([payload]).select().single();
    if (error) sbThrow('createInquiry', error);
    console.log(`[DB] ✅ Inquiry saved to Supabase: id=${row.id}`);
    return row;
  }
  const inquiry = {
    id: `INQ-${mem.counters.inquiries++}`,
    ...payload,
    created_at: new Date().toISOString(),
  };
  mem.inquiries.push(inquiry);
  return inquiry;
}

async function getAllInquiries(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('purchase_inquiries').select('*').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.search) {
      q = q.or(`customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`);
    }
    const { data, error } = await q;
    if (error) sbThrow('getAllInquiries', error);
    return data || [];
  }
  let result = [...mem.inquiries];
  if (filters.status) result = result.filter(i => i.status === filters.status);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(i =>
      (i.customer_name || '').toLowerCase().includes(s) ||
      (i.customer_phone || '').includes(s)
    );
  }
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateInquiry(id, data) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  delete payload.id;
  delete payload.created_at;

  if (useSupabase) {
    const { data: row, error } = await supabase.from('purchase_inquiries').update(payload).eq('id', id).select().maybeSingle();
    if (error) sbThrow('updateInquiry', error);
    // null when id not found — callers handle 404
    return row;
  }
  const inquiry = mem.inquiries.find(i => String(i.id) === String(id));
  if (!inquiry) return null;
  Object.assign(inquiry, payload);
  return inquiry;
}

// =============================================
// MESSAGES / CONVERSATIONS
// (flat table — one row per message)
// =============================================
async function saveConversation(data) {
  const payload = {
    phone_number:     data.phone_number || data.phoneNumber || '',
    customer_id:      data.customer_id || null,
    customer_name:    data.customer_name || data.customerName || null,
    customer_message: data.customer_message || data.customerMessage || '',
    ai_response:      data.ai_response || data.aiResponse || '',
    response_time:    parseInt(data.response_time || data.responseTime || 0) || 0,
    sentiment:        data.sentiment || 'محايد',
    topic:            data.topic || 'عام',
    intent:           data.intent || null,
    tools_used:       Array.isArray(data.tools_used) ? data.tools_used.join(',') : (data.tools_used || ''),
    escalated:        !!data.escalated,
    message_id:       data.message_id || data.messageId || null,
    status:           data.status || 'delivered',
  };

  if (useSupabase) {
    const { data: row, error } = await supabase.from('messages').insert([payload]).select().single();
    if (error) sbThrow('saveConversation', error);
    return row;
  }
  const msg = {
    id: mem.counters.messages++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  mem.messages.push(msg);
  if (mem.messages.length > 5000) mem.messages.shift();
  return msg;
}

async function getConversations(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('messages').select('*').order('created_at', { ascending: false });
    if (filters.phone_number) q = q.eq('phone_number', filters.phone_number);
    if (filters.date_from)    q = q.gte('created_at', filters.date_from);
    if (filters.date_to)      q = q.lte('created_at', filters.date_to + 'T23:59:59Z');
    q = q.limit(filters.limit || 1000);
    const { data, error } = await q;
    if (error) sbThrow('getConversations', error);
    return data || [];
  }
  let result = [...mem.messages];
  if (filters.phone_number) result = result.filter(c => c.phone_number === filters.phone_number);
  if (filters.date_from)    result = result.filter(c => c.created_at >= filters.date_from);
  if (filters.date_to)      result = result.filter(c => c.created_at <= filters.date_to + 'T23:59:59Z');
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (filters.limit) result = result.slice(0, filters.limit);
  return result;
}

async function getConversationsByPhone(phone) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('phone_number', phone)
      .order('created_at', { ascending: true });
    if (error) sbThrow('getConversationsByPhone', error);
    return data || [];
  }
  return mem.messages
    .filter(c => c.phone_number === phone)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function getGroupedConversations(limit = 50) {
  // Group by phone_number, newest last_message_at first
  let rows = [];
  if (useSupabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) sbThrow('getGroupedConversations', error);
    rows = data || [];
  } else {
    rows = [...mem.messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const grouped = new Map();
  for (const row of rows) {
    const phone = row.phone_number;
    if (!phone) continue;
    if (!grouped.has(phone)) {
      grouped.set(phone, {
        phone_number: phone,
        customer_name: row.customer_name || phone,
        last_message: row.created_at,
        message_count: 0,
        messages: [],
      });
    }
    const g = grouped.get(phone);
    g.messages.push(row);
    g.message_count++;
  }
  // Sort messages inside each thread chronologically
  for (const g of grouped.values()) {
    g.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return Array.from(grouped.values()).slice(0, limit);
}

// =============================================
// ANALYTICS & STATS
// =============================================
async function getLiveStats() {
  const today = new Date().toISOString().split('T')[0];

  if (useSupabase) {
    const [bookingsRes, carsRes, partsRes, ticketsRes, inquiriesRes, customersRes, msgsRes] = await Promise.all([
      supabase.from('bookings').select('status, preferred_date'),
      supabase.from('cars').select('status'),
      supabase.from('parts').select('quantity, min_quantity'),
      supabase.from('support_tickets').select('status'),
      supabase.from('purchase_inquiries').select('status'),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('created_at').gte('created_at', today).limit(1000),
    ]);

    // Surface any errors loudly (but don't crash the whole dashboard)
    for (const [label, res] of [
      ['bookings', bookingsRes], ['cars', carsRes], ['parts', partsRes],
      ['support_tickets', ticketsRes], ['purchase_inquiries', inquiriesRes],
      ['customers', customersRes], ['messages', msgsRes],
    ]) {
      if (res.error) console.error(`[DB] getLiveStats.${label} error:`, res.error.message);
    }

    const bookings  = bookingsRes.data  || [];
    const cars      = carsRes.data      || [];
    const parts     = partsRes.data     || [];
    const tickets   = ticketsRes.data   || [];
    const inquiries = inquiriesRes.data || [];
    const msgs      = msgsRes.data      || [];

    return {
      bookings_today:      bookings.filter(b => b.preferred_date === today && b.status !== 'cancelled').length,
      bookings_pending:    bookings.filter(b => b.status === 'pending').length,
      bookings_confirmed:  bookings.filter(b => b.status === 'confirmed').length,
      bookings_total:      bookings.length,
      cars_available:      cars.filter(c => c.status === 'available').length,
      cars_reserved:       cars.filter(c => c.status === 'reserved').length,
      cars_sold:           cars.filter(c => c.status === 'sold').length,
      cars_total:          cars.length,
      parts_low_stock:     parts.filter(p => p.quantity > 0 && p.quantity <= (p.min_quantity || 5)).length,
      parts_out_of_stock:  parts.filter(p => p.quantity === 0).length,
      tickets_open:        tickets.filter(t => t.status === 'open').length,
      tickets_in_progress: tickets.filter(t => t.status === 'in_progress').length,
      tickets_resolved:    tickets.filter(t => t.status === 'resolved').length,
      tickets_total:       tickets.length,
      inquiries_new:       inquiries.filter(i => i.status === 'new').length,
      inquiries_contacted: inquiries.filter(i => i.status === 'contacted').length,
      inquiries_qualified: inquiries.filter(i => i.status === 'qualified').length,
      inquiries_total:     inquiries.length,
      total_customers:     customersRes.count || 0,
      conversations_today: msgs.length,
      updated_at:          new Date().toISOString(),
    };
  }

  // In-memory fallback
  return {
    bookings_today:      mem.bookings.filter(b => b.preferred_date === today && b.status !== 'cancelled').length,
    bookings_pending:    mem.bookings.filter(b => b.status === 'pending').length,
    bookings_confirmed:  mem.bookings.filter(b => b.status === 'confirmed').length,
    bookings_total:      mem.bookings.length,
    cars_available:      mem.cars.filter(c => c.status === 'available').length,
    cars_reserved:       mem.cars.filter(c => c.status === 'reserved').length,
    cars_sold:           mem.cars.filter(c => c.status === 'sold').length,
    cars_total:          mem.cars.length,
    parts_low_stock:     mem.parts.filter(p => p.quantity > 0 && p.quantity <= (p.min_quantity || 5)).length,
    parts_out_of_stock:  mem.parts.filter(p => p.quantity === 0).length,
    tickets_open:        mem.tickets.filter(t => t.status === 'open').length,
    tickets_in_progress: mem.tickets.filter(t => t.status === 'in_progress').length,
    tickets_resolved:    mem.tickets.filter(t => t.status === 'resolved').length,
    tickets_total:       mem.tickets.length,
    inquiries_new:       mem.inquiries.filter(i => i.status === 'new').length,
    inquiries_contacted: mem.inquiries.filter(i => i.status === 'contacted').length,
    inquiries_qualified: mem.inquiries.filter(i => i.status === 'qualified').length,
    inquiries_total:     mem.inquiries.length,
    total_customers:     mem.customers.size,
    conversations_today: mem.messages.filter(m => m.created_at?.startsWith(today)).length,
    updated_at:          new Date().toISOString(),
  };
}

async function getStats() {
  const live = await getLiveStats();
  let total_parts = mem.parts.length;
  if (useSupabase) {
    const { count } = await supabase.from('parts').select('id', { count: 'exact', head: true });
    total_parts = count || 0;
  }
  return {
    total_cars:       live.cars_total,
    available_cars:   live.cars_available,
    total_parts,
    total_bookings:   live.bookings_total,
    pending_bookings: live.bookings_pending,
    open_tickets:     live.tickets_open,
    total_inquiries:  live.inquiries_total,
    total_customers:  live.total_customers,
  };
}

async function getAnalytics(from, to) {
  const convs = await getConversations({ date_from: from, date_to: to, limit: 5000 });

  const dailyMap = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().split('T')[0]] = 0;
  }
  convs.forEach(c => {
    const date = (c.created_at || '').split('T')[0];
    if (date && Object.prototype.hasOwnProperty.call(dailyMap, date)) dailyMap[date]++;
  });

  const sentMap = {};
  convs.forEach(c => { sentMap[c.sentiment] = (sentMap[c.sentiment] || 0) + 1; });

  const topicMap = {};
  convs.forEach(c => { topicMap[c.topic] = (topicMap[c.topic] || 0) + 1; });

  return {
    totalMessages:    convs.length,
    uniqueCustomers:  new Set(convs.map(c => c.phone_number)).size,
    escalatedCount:   convs.filter(c => c.escalated).length,
    avgResponseTime:  convs.length > 0 ? Math.round(convs.reduce((s, c) => s + (c.response_time || 0), 0) / convs.length) : 0,
    dailyMessages:    Object.entries(dailyMap).map(([date, count]) => ({ date, count })),
    sentimentCounts:  Object.entries(sentMap).map(([sentiment, count]) => ({ sentiment, count })),
    topicCounts:      Object.entries(topicMap).map(([topic, count]) => ({ topic, count })),
  };
}

async function getDashboardStats() {
  const [dbStats, analytics] = await Promise.all([getStats(), getAnalytics()]);
  return {
    ...dbStats,
    totalMessages:   analytics.totalMessages,
    uniqueCustomers: analytics.uniqueCustomers,
    escalatedCount:  analytics.escalatedCount,
    avgResponseTime: analytics.avgResponseTime,
  };
}

async function getBranchStats() {
  const [cars, bookings] = await Promise.all([getAllCars(), getAllBookings()]);
  const today = new Date().toISOString().split('T')[0];

  return BRANCHES.map(branch => {
    const key = branch.name.split(' ')[0]; // e.g. "عمان"
    const branchBookings = bookings.filter(b => (b.branch || '').includes(key));
    return {
      ...branch,
      cars_available:     cars.filter(c => (c.branch || '').includes(key) && c.status === 'available').length,
      total_bookings:     branchBookings.length,
      today_bookings:     branchBookings.filter(b => b.preferred_date === today).length,
      pending_bookings:   branchBookings.filter(b => b.status === 'pending').length,
      confirmed_bookings: branchBookings.filter(b => b.status === 'confirmed').length,
    };
  });
}

async function getAllBranches() {
  return BRANCHES;
}

async function getActivePromotions() {
  const today = new Date().toISOString().split('T')[0];
  if (useSupabase) {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('active', true)
      .or(`valid_until.is.null,valid_until.gte.${today}`);
    if (error) sbThrow('getActivePromotions', error);
    return data || [];
  }
  return mem.promotions.filter(p => p.active !== false && (!p.valid_until || p.valid_until >= today));
}

// =============================================
// CONVERSATION STATES
// (multi-turn context that survives Netlify cold starts)
// =============================================
// In-memory fallback for dev mode only
const memConvStates = new Map();

/**
 * Load the persisted conversation state for a phone number.
 * Returns null if no state exists yet.
 *
 * Shape:
 *   {
 *     phone_number: string,
 *     history: [{role: 'user'|'assistant', content: string}, ...],
 *     pending_intent: string | null,
 *     collected_entities: object,
 *     turn_count: number,
 *     last_active: string ISO,
 *   }
 */
async function getConversationState(phoneNumber) {
  if (!phoneNumber) return null;
  // If table doesn't exist yet (migration not run), return null gracefully
  if (!conversationStatesAvailable) return null;

  if (useSupabase) {
    const { data, error } = await supabase
      .from('conversation_states')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (error) sbThrow('getConversationState', error);
    return data || null;
  }
  return memConvStates.get(phoneNumber) || null;
}

/**
 * Upsert the conversation state. Always updates last_active to NOW().
 *
 * @param {string} phoneNumber
 * @param {object} state — { history?, pending_intent?, collected_entities?, turn_count? }
 */
async function saveConversationState(phoneNumber, state) {
  if (!phoneNumber) return;
  if (!conversationStatesAvailable) return; // silently skip if table missing

  const payload = {
    phone_number:       phoneNumber,
    history:            Array.isArray(state.history) ? state.history : [],
    pending_intent:     state.pending_intent || null,
    collected_entities: state.collected_entities && typeof state.collected_entities === 'object' ? state.collected_entities : {},
    turn_count:         Number.isFinite(state.turn_count) ? state.turn_count : 0,
    last_active:        new Date().toISOString(),
  };

  if (useSupabase) {
    const { error } = await supabase
      .from('conversation_states')
      .upsert(payload, { onConflict: 'phone_number' });
    if (error) sbThrow('saveConversationState', error);
    return;
  }

  // In-memory fallback
  const existing = memConvStates.get(phoneNumber) || {};
  memConvStates.set(phoneNumber, { ...existing, ...payload, created_at: existing.created_at || new Date().toISOString() });
}

/**
 * Clear conversation state — used after a tool successfully executes
 * (booking confirmed, ticket created, etc.) so the next message starts
 * a fresh interaction.
 */
async function clearConversationState(phoneNumber) {
  if (!phoneNumber) return;
  if (!conversationStatesAvailable) return;

  if (useSupabase) {
    const { error } = await supabase
      .from('conversation_states')
      .delete()
      .eq('phone_number', phoneNumber);
    if (error) sbThrow('clearConversationState', error);
    return;
  }
  memConvStates.delete(phoneNumber);
}

// Legacy compatibility shim (no sqlite in serverless anymore)
function getDb() {
  return {
    prepare: () => ({ all: () => [], get: () => null, run: () => ({}) }),
  };
}

// =============================================
// Module Exports
// =============================================
module.exports = {
  initDatabase,
  getDbMode,
  // Cars
  searchCars,
  getCarById,
  getAllCars,
  addCar,
  updateCar,
  deleteCar,
  // Parts
  searchParts,
  getAllParts,
  updatePart,
  addPart,
  // Customers
  getCustomer,
  upsertCustomer,
  getOrCreateCustomer,
  updateCustomerLoyalty,
  // Bookings
  createBooking,
  getCustomerBookings,
  getAllBookings,
  updateBookingStatus,
  getBookingsByBranchAndDate,
  // Tickets
  createTicket,
  getAllTickets,
  updateTicket,
  // Inquiries
  createInquiry,
  getAllInquiries,
  updateInquiry,
  // Conversations / Messages
  saveConversation,
  getConversations,
  getConversationsByPhone,
  getGroupedConversations,
  // Conversation States (multi-turn context)
  getConversationState,
  saveConversationState,
  clearConversationState,
  // Analytics & Stats
  getLiveStats,
  getStats,
  getAnalytics,
  getDashboardStats,
  getBranchStats,
  getAllBranches,
  getActivePromotions,
  // Legacy
  getDb,
  // Expose for health checks
  get isSupabase() { return useSupabase; },
};
