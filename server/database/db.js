/**
 * أوتو جوردن - Database Layer
 * Auto Jordan Car Dealership Database
 *
 * Primary:  Supabase (PostgreSQL) — persists across all Netlify serverless instances
 * Fallback: In-memory (dev/local use only — data lost on each cold start)
 *
 * All exported functions are ASYNC — use await everywhere.
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
  console.log('[DB] ✅ Supabase connected — data will persist across instances');
} else {
  // Warn loudly but DON'T crash — let the app start and use in-memory fallback
  if (isProduction || isNetlify) {
    console.error('[DB] ❌ WARNING: SUPABASE_URL / SUPABASE_SERVICE_KEY not set in production!');
    console.error('[DB] ❌ Using in-memory fallback — DATA WILL BE LOST on cold start!');
  } else {
    console.warn('[DB] ⚠️  Using in-memory fallback (dev mode)');
  }
}

// =============================================
// In-Memory Fallback Database
// =============================================
const mem = {
  customers: new Map(),
  cars: [],
  parts: [],
  maintenanceBookings: [],
  supportTickets: [],
  purchaseInquiries: [],
  promotions: [],
  conversations: [],
  counters: { bookings: 1000, tickets: 2000, inquiries: 3000 },
};

const BRANCHES = [
  { id: 1, name: 'عمان - الرئيسي', address: 'شارع المدينة المنورة، عمان', phone: '06-5000001', hours_weekday: '8ص-8م', hours_friday: '8ص-2م', hours_saturday: '8ص-6م', services: ['بيع سيارات', 'صيانة', 'قطع غيار', 'سمكرة ودهان'] },
  { id: 2, name: 'إربد', address: 'شارع الجامعة، إربد', phone: '02-7200001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
  { id: 3, name: 'الزرقاء', address: 'شارع الأمير محمد، الزرقاء', phone: '05-3900001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
  { id: 4, name: 'العقبة', address: 'شارع الملك الحسين، العقبة', phone: '03-2010001', hours_weekday: '8ص-7م', hours_friday: '8ص-2م', hours_saturday: '8ص-5م', services: ['بيع سيارات', 'صيانة', 'قطع غيار'] },
];

// =============================================
// Seed In-Memory Data (used only if Supabase not configured)
// =============================================
function seedMemory() {
  mem.cars = [
    { id: 1, make: 'Toyota', model: 'Camry', year: 2024, color: 'أبيض لؤلؤي', price: 18500, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'كاميرا خلفية، شاشة لمس، كروز كنترول، نظام ملاحة', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 2, make: 'Toyota', model: 'Camry', year: 2024, color: 'أسود', price: 18500, mileage: 0, condition: 'new', status: 'available', branch: 'إربد', features: 'كاميرا خلفية، شاشة لمس، كروز كنترول', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 3, make: 'Toyota', model: 'Land Cruiser', year: 2023, color: 'أبيض', price: 58000, mileage: 35000, condition: 'used', status: 'available', branch: 'عمان', features: 'فل أوبشن، 4WD، 7 مقاعد، نظام ملاحة', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '4.0L' },
    { id: 4, make: 'Toyota', model: 'Corolla', year: 2024, color: 'فضي', price: 14500, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'كاميرا خلفية، بلوتوث، مكيف', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 5, make: 'Toyota', model: 'Corolla', year: 2022, color: 'أبيض', price: 11800, mileage: 42000, condition: 'used', status: 'available', branch: 'الزرقاء', features: 'بلوتوث، مكيف، كاميرا خلفية', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 6, make: 'Toyota', model: 'RAV4', year: 2024, color: 'أحمر', price: 22000, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'AWD، شاشة لمس، كاميرا 360', fuel_type: 'هجين', transmission: 'أوتوماتيك', engine: '2.5L Hybrid' },
    { id: 7, make: 'Hyundai', model: 'Tucson', year: 2024, color: 'رمادي', price: 16800, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'بانورامك، شاشة لمس، كاميرا 360، كروز', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
    { id: 8, make: 'Hyundai', model: 'Elantra', year: 2024, color: 'أزرق', price: 13200, mileage: 0, condition: 'new', status: 'available', branch: 'إربد', features: 'كاميرا خلفية، بلوتوث، شاشة لمس', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 9, make: 'Hyundai', model: 'Santa Fe', year: 2023, color: 'أسود', price: 28500, mileage: 18000, condition: 'used', status: 'available', branch: 'عمان', features: '7 مقاعد، AWD، فل أوبشن', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5T' },
    { id: 10, make: 'Kia', model: 'Sportage', year: 2024, color: 'أبيض', price: 17200, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'بانورامك، كاميرا 360، شاشة 12 بوصة', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
    { id: 11, make: 'Kia', model: 'Cerato', year: 2024, color: 'رمادي', price: 12800, mileage: 0, condition: 'new', status: 'available', branch: 'الزرقاء', features: 'كاميرا خلفية، شاشة لمس، بلوتوث', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6L' },
    { id: 12, make: 'MG', model: 'ZS', year: 2024, color: 'أبيض', price: 12500, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'شاشة لمس كبيرة، كاميرا خلفية، كروز', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.5T' },
    { id: 13, make: 'MG', model: 'HS', year: 2024, color: 'رمادي', price: 15800, mileage: 0, condition: 'new', status: 'available', branch: 'عمان', features: 'بانورامك، كاميرا 360، AWD', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.0T' },
    { id: 14, make: 'Nissan', model: 'Sunny', year: 2024, color: 'أبيض', price: 9800, mileage: 0, condition: 'new', status: 'available', branch: 'العقبة', features: 'مكيف، بلوتوث، كاميرا خلفية', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.5L' },
    { id: 15, make: 'Nissan', model: 'Altima', year: 2023, color: 'أسود', price: 16500, mileage: 22000, condition: 'used', status: 'available', branch: 'عمان', features: 'كروز، كاميرا خلفية، شاشة لمس', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.5L' },
    { id: 16, make: 'BMW', model: '320i', year: 2022, color: 'أبيض', price: 32000, mileage: 28000, condition: 'used', status: 'available', branch: 'عمان', features: 'فل أوبشن، نظام ملاحة، جلد', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '2.0T' },
    { id: 17, make: 'Chery', model: 'Tiggo 8 Pro', year: 2024, color: 'أبيض', price: 14800, mileage: 0, condition: 'new', status: 'available', branch: 'إربد', features: '7 مقاعد، بانورامك، شاشة كبيرة', fuel_type: 'بنزين', transmission: 'أوتوماتيك', engine: '1.6T' },
  ];

  mem.parts = [
    { id: 1, name: 'فلتر زيت', part_number: 'OIL-TOY-001', compatible: ['Toyota Camry', 'Toyota Corolla', 'Toyota RAV4'], quantity: 45, price: 8, location: 'رف A1', category: 'فلاتر' },
    { id: 2, name: 'فلتر زيت', part_number: 'OIL-HYU-001', compatible: ['Hyundai Tucson', 'Hyundai Elantra', 'Hyundai Santa Fe'], quantity: 32, price: 7, location: 'رف A2', category: 'فلاتر' },
    { id: 3, name: 'فلتر هواء', part_number: 'AIR-TOY-001', compatible: ['Toyota Camry', 'Toyota Corolla'], quantity: 20, price: 12, location: 'رف A3', category: 'فلاتر' },
    { id: 4, name: 'فلتر هواء', part_number: 'AIR-KIA-001', compatible: ['Kia Sportage', 'Kia Cerato'], quantity: 15, price: 11, location: 'رف A4', category: 'فلاتر' },
    { id: 5, name: 'فلتر مكيف', part_number: 'CAB-TOY-001', compatible: ['Toyota Camry', 'Toyota Corolla', 'Toyota RAV4'], quantity: 28, price: 9, location: 'رف A5', category: 'فلاتر' },
    { id: 6, name: 'بطارية 60 أمبير', part_number: 'BAT-60-001', compatible: ['Nissan Sunny', 'Hyundai Elantra', 'Kia Cerato'], quantity: 8, price: 65, location: 'رف B1', category: 'بطاريات' },
    { id: 7, name: 'بطارية 75 أمبير', part_number: 'BAT-75-001', compatible: ['Toyota Camry', 'Toyota Corolla', 'Hyundai Tucson'], quantity: 12, price: 85, location: 'رف B2', category: 'بطاريات' },
    { id: 8, name: 'بطارية 90 أمبير', part_number: 'BAT-90-001', compatible: ['Toyota Land Cruiser', 'Hyundai Santa Fe', 'BMW 320i'], quantity: 5, price: 110, location: 'رف B3', category: 'بطاريات' },
    { id: 9, name: 'بريك باد أمامي', part_number: 'BRK-TOY-F001', compatible: ['Toyota Camry', 'Toyota Corolla'], quantity: 18, price: 35, location: 'رف C1', category: 'بريك' },
    { id: 10, name: 'بريك باد خلفي', part_number: 'BRK-TOY-R001', compatible: ['Toyota Camry', 'Toyota Corolla'], quantity: 14, price: 28, location: 'رف C2', category: 'بريك' },
    { id: 11, name: 'بريك باد أمامي', part_number: 'BRK-HYU-F001', compatible: ['Hyundai Tucson', 'Hyundai Elantra'], quantity: 10, price: 32, location: 'رف C3', category: 'بريك' },
    { id: 12, name: 'قرص بريك أمامي', part_number: 'DSC-TOY-F001', compatible: ['Toyota Camry', 'Toyota RAV4'], quantity: 6, price: 55, location: 'رف C4', category: 'بريك' },
    { id: 13, name: 'إطار 195/65R15', part_number: 'TYR-195-65-15', compatible: ['Toyota Corolla', 'Hyundai Elantra', 'Kia Cerato'], quantity: 16, price: 45, location: 'رف D1', category: 'إطارات' },
    { id: 14, name: 'إطار 215/55R17', part_number: 'TYR-215-55-17', compatible: ['Toyota Camry', 'Hyundai Tucson', 'Kia Sportage'], quantity: 20, price: 62, location: 'رف D2', category: 'إطارات' },
    { id: 15, name: 'إطار 265/70R17', part_number: 'TYR-265-70-17', compatible: ['Toyota Land Cruiser', 'Hyundai Santa Fe'], quantity: 8, price: 95, location: 'رف D3', category: 'إطارات' },
    { id: 16, name: 'شمعات NGK (طقم)', part_number: 'SPK-NGK-001', compatible: ['Toyota Camry', 'Toyota Corolla', 'Nissan Sunny'], quantity: 25, price: 22, location: 'رف E1', category: 'شمعات' },
    { id: 17, name: 'شمعات بوش (طقم)', part_number: 'SPK-BSH-001', compatible: ['Hyundai Tucson', 'Kia Sportage', 'BMW 320i'], quantity: 15, price: 28, location: 'رف E2', category: 'شمعات' },
    { id: 18, name: 'زيت محرك 5W-30 (4 لتر)', part_number: 'OIL-5W30-4L', compatible: ['جميع السيارات'], quantity: 60, price: 18, location: 'رف F1', category: 'زيوت' },
    { id: 19, name: 'زيت محرك 0W-20 (4 لتر)', part_number: 'OIL-0W20-4L', compatible: ['Toyota Camry 2020+', 'Toyota RAV4 Hybrid'], quantity: 30, price: 24, location: 'رف F2', category: 'زيوت' },
  ];

  mem.promotions = [
    { id: 1, title: 'عرض رمضان الكريم 🌙', description: 'خصم 500 دينار على جميع السيارات الجديدة + 3 سنوات كفالة مجانية', valid_until: '2026-04-30', applies_to: 'جميع السيارات الجديدة' },
    { id: 2, title: 'عرض فحص مجاني', description: 'فحص شامل مجاني 21 نقطة مع كل موعد صيانة', valid_until: '2026-06-30', applies_to: 'جميع العملاء' },
    { id: 3, title: 'تقسيط بدون فوائد', description: 'تقسيط حتى 60 شهراً بدون فوائد على سيارات MG و Chery', valid_until: '2026-05-31', applies_to: 'MG & Chery' },
    { id: 4, title: 'استبدال سيارتك القديمة', description: 'نشتري سيارتك القديمة بأفضل سعر ونستبدلها بجديدة', valid_until: '2026-12-31', applies_to: 'جميع العملاء' },
  ];
}

// =============================================
// Initialize Database
// =============================================
async function initDatabase() {
  seedMemory();
  if (useSupabase) {
    // Verify connection
    const { error } = await supabase.from('cars').select('id').limit(1);
    if (error) {
      console.error('[DB] ❌ Supabase connection failed:', error.message);
      console.warn('[DB] ⚠️  Falling back to in-memory database');
      useSupabase = false;
    } else {
      console.log('[DB] ✅ Supabase ready');
    }
  } else {
    console.log(`[DB] 🚗 In-memory: ${mem.cars.length} cars | 🔧 ${mem.parts.length} parts | 🎯 ${mem.promotions.length} promotions`);
  }
}

// Helper: handle Supabase errors
function sbErr(operation, error) {
  console.error(`[DB] Supabase ${operation} error:`, error?.message);
}

// =============================================
// CARS
// =============================================
async function searchCars(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('cars').select('*').eq('status', 'available');
    if (filters.make)  q = q.ilike('make', `%${filters.make}%`);
    if (filters.model) q = q.ilike('model', `%${filters.model}%`);
    if (filters.year)  q = q.eq('year', parseInt(filters.year));
    if (filters.min_price) q = q.gte('price', filters.min_price);
    if (filters.max_price) q = q.lte('price', filters.max_price);
    if (filters.branch) q = q.ilike('branch', `%${filters.branch}%`);
    if (filters.fuel_type) q = q.ilike('fuel_type', `%${filters.fuel_type}%`);
    q = q.limit(5);
    const { data, error } = await q;
    if (error) { sbErr('searchCars', error); } else return data || [];
  }
  // Fallback
  let results = mem.cars.filter(c => c.status === 'available');
  if (filters.make)  results = results.filter(c => c.make.toLowerCase().includes(filters.make.toLowerCase()));
  if (filters.model) results = results.filter(c => c.model.toLowerCase().includes(filters.model.toLowerCase()));
  if (filters.year)  results = results.filter(c => c.year === parseInt(filters.year));
  if (filters.min_price) results = results.filter(c => c.price >= filters.min_price);
  if (filters.max_price) results = results.filter(c => c.price <= filters.max_price);
  if (filters.branch) results = results.filter(c => c.branch.includes(filters.branch));
  if (filters.fuel_type) results = results.filter(c => c.fuel_type.includes(filters.fuel_type));
  return results.slice(0, 5);
}

async function getCarById(id) {
  if (useSupabase) {
    const { data, error } = await supabase.from('cars').select('*').eq('id', id).single();
    if (error) { sbErr('getCarById', error); } else return data;
  }
  return mem.cars.find(c => String(c.id) === String(id)) || null;
}

async function getAllCars() {
  if (useSupabase) {
    const { data, error } = await supabase.from('cars').select('*').order('created_at', { ascending: false });
    if (error) { sbErr('getAllCars', error); } else return data || [];
  }
  return [...mem.cars].sort((a, b) => b.id - a.id);
}

async function addCar(data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('cars').insert([{ status: 'available', ...data }]).select().single();
    if (error) { sbErr('addCar', error); } else return row;
  }
  const newId = Math.max(0, ...mem.cars.map(c => c.id)) + 1;
  const car = { id: newId, status: 'available', ...data, created_at: new Date().toISOString() };
  mem.cars.push(car);
  return car;
}

async function updateCar(id, data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('cars').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) { sbErr('updateCar', error); } else return row;
  }
  const idx = mem.cars.findIndex(c => String(c.id) === String(id));
  if (idx === -1) return null;
  mem.cars[idx] = { ...mem.cars[idx], ...data, updated_at: new Date().toISOString() };
  return mem.cars[idx];
}

async function deleteCar(id) {
  if (useSupabase) {
    const { error } = await supabase.from('cars').delete().eq('id', id);
    if (error) { sbErr('deleteCar', error); return false; }
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
    q = q.limit(6);
    const { data, error } = await q;
    if (error) { sbErr('searchParts', error); } else return data || [];
  }
  let results = mem.parts;
  if (filters.name) results = results.filter(p =>
    p.name.toLowerCase().includes(filters.name.toLowerCase()) ||
    p.category.toLowerCase().includes(filters.name.toLowerCase())
  );
  if (filters.part_number) results = results.filter(p => p.part_number.toLowerCase().includes(filters.part_number.toLowerCase()));
  if (filters.car_make || filters.car_model) {
    const search = `${filters.car_make || ''} ${filters.car_model || ''}`.trim().toLowerCase();
    results = results.filter(p =>
      (Array.isArray(p.compatible) ? p.compatible : []).some(c =>
        c.toLowerCase().includes(search) || search.includes(c.toLowerCase().split(' ')[0])
      ) || (Array.isArray(p.compatible) && p.compatible.includes('جميع السيارات'))
    );
  }
  return results.slice(0, 6);
}

async function getAllParts() {
  if (useSupabase) {
    const { data, error } = await supabase.from('parts').select('*').order('name');
    if (error) { sbErr('getAllParts', error); } else return data || [];
  }
  return [...mem.parts].sort((a, b) => a.name.localeCompare(b.name));
}

async function updatePart(id, data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('parts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) { sbErr('updatePart', error); } else return row;
  }
  const idx = mem.parts.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return null;
  mem.parts[idx] = { ...mem.parts[idx], ...data, updated_at: new Date().toISOString() };
  return mem.parts[idx];
}

async function addPart(data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('parts').insert([{ quantity: 0, ...data }]).select().single();
    if (error) { sbErr('addPart', error); } else return row;
  }
  const newId = Math.max(0, ...mem.parts.map(p => p.id)) + 1;
  const part = { id: newId, quantity: 0, ...data, created_at: new Date().toISOString() };
  mem.parts.push(part);
  return part;
}

// =============================================
// CUSTOMERS
// =============================================
async function getCustomer(phone) {
  if (useSupabase) {
    const { data, error } = await supabase.from('customers').select('*').eq('phone', phone).single();
    if (error && error.code !== 'PGRST116') sbErr('getCustomer', error);
    return data || null;
  }
  return mem.customers.get(phone) || null;
}

async function upsertCustomer(phone, data) {
  if (useSupabase) {
    const existing = await getCustomer(phone);
    if (existing) {
      const { data: row, error } = await supabase.from('customers').update({ ...data, updated_at: new Date().toISOString() }).eq('phone', phone).select().single();
      if (error) { sbErr('upsertCustomer.update', error); } else return row;
    } else {
      const { data: row, error } = await supabase.from('customers').insert([{ phone, ...data }]).select().single();
      if (error) { sbErr('upsertCustomer.insert', error); } else return row;
    }
  }
  const existing = mem.customers.get(phone) || { phone, created_at: new Date().toISOString() };
  const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
  mem.customers.set(phone, updated);
  return updated;
}

async function getOrCreateCustomer(phone, name) {
  if (useSupabase) {
    const existing = await getCustomer(phone);
    if (existing) return existing;
    const { data: row, error } = await supabase.from('customers').insert([{ phone, name: name || phone }]).select().single();
    if (error) { sbErr('getOrCreateCustomer', error); return { phone, name }; }
    return row;
  }
  const existing = mem.customers.get(phone);
  if (existing) return existing;
  const newCustomer = { id: `C-${phone}`, phone, name: name || phone, loyalty_points: 0, created_at: new Date().toISOString() };
  mem.customers.set(phone, newCustomer);
  return newCustomer;
}

async function updateCustomerLoyalty(customerId, points) {
  if (useSupabase) {
    const { data: existing } = await supabase.from('customers').select('loyalty_points').eq('id', customerId).single();
    if (existing) {
      await supabase.from('customers').update({ loyalty_points: (existing.loyalty_points || 0) + points }).eq('id', customerId);
    }
    return;
  }
  for (const [phone, customer] of mem.customers.entries()) {
    if (customer.id === customerId) {
      customer.loyalty_points = (customer.loyalty_points || 0) + points;
      mem.customers.set(phone, customer);
      break;
    }
  }
}

// =============================================
// BOOKINGS
// =============================================
async function createBooking(data) {
  // Map field names from agent-tools to Supabase schema
  const mapped = {
    phone: data.customer_phone || data.phone,
    customer_name: data.customer_name,
    car_details: data.car_make ? `${data.car_make} ${data.car_model || ''} ${data.car_year || ''}`.trim() : data.car_details,
    booking_type: data.service_type ? 'service' : (data.booking_type || 'consultation'),
    preferred_date: data.preferred_date,
    preferred_time: data.preferred_time,
    notes: [data.service_type, data.notes].filter(Boolean).join(' — '),
    status: 'pending',
  };

  if (useSupabase) {
    const { data: row, error } = await supabase
      .from('bookings')
      .insert([mapped])
      .select()
      .single();
    if (error) { sbErr('createBooking', error); }
    else {
      console.log(`[DB] ✅ Booking saved to Supabase: ${row.id}`);
      return { ...row, ...data }; // Return merged so agent-tools gets car_make etc.
    }
  }
  const booking = {
    id: `BK-${mem.counters.bookings++}`,
    ...data,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  mem.maintenanceBookings.push(booking);
  return booking;
}

async function getCustomerBookings(phone) {
  if (useSupabase) {
    const { data, error } = await supabase.from('bookings').select('*').eq('phone', phone).order('created_at', { ascending: false });
    if (error) { sbErr('getCustomerBookings', error); } else return data || [];
  }
  return mem.maintenanceBookings.filter(b => b.customer_phone === phone || b.phone === phone);
}

async function getAllBookings(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.date)   q = q.eq('preferred_date', filters.date);
    const { data, error } = await q;
    if (error) { sbErr('getAllBookings', error); } else return data || [];
  }
  let result = [...mem.maintenanceBookings];
  if (filters.status) result = result.filter(b => b.status === filters.status);
  if (filters.date)   result = result.filter(b => b.preferred_date === filters.date);
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateBookingStatus(id, status, notes) {
  if (useSupabase) {
    const update = { status, updated_at: new Date().toISOString() };
    if (notes) update.staff_notes = notes;
    const { data: row, error } = await supabase.from('bookings').update(update).eq('id', id).select().single();
    if (error) { sbErr('updateBookingStatus', error); } else return row;
  }
  const booking = mem.maintenanceBookings.find(b => b.id === id);
  if (!booking) return null;
  booking.status = status;
  if (notes) booking.staff_notes = notes;
  booking.updated_at = new Date().toISOString();
  return booking;
}

// =============================================
// SUPPORT TICKETS
// =============================================
async function createTicket(data) {
  const mapped = {
    phone: data.customer_phone || data.phone,
    customer_name: data.customer_name,
    subject: data.issue_description?.substring(0, 80) || data.subject || 'طلب دعم',
    description: data.issue_description || data.description || '',
    priority: data.priority || 'medium',
    status: 'open',
  };

  if (useSupabase) {
    const { data: row, error } = await supabase
      .from('support_tickets')
      .insert([mapped])
      .select()
      .single();
    if (error) { sbErr('createTicket', error); }
    else {
      console.log(`[DB] ✅ Ticket saved to Supabase: ${row.id}`);
      return row;
    }
  }
  const ticket = {
    id: `TK-${mem.counters.tickets++}`,
    ...data,
    status: 'open',
    created_at: new Date().toISOString(),
  };
  mem.supportTickets.push(ticket);
  return ticket;
}

async function getAllTickets(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) { sbErr('getAllTickets', error); } else return data || [];
  }
  let result = [...mem.supportTickets];
  if (filters.status) result = result.filter(t => t.status === filters.status);
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateTicket(id, data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('support_tickets').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) { sbErr('updateTicket', error); } else return row;
  }
  const ticket = mem.supportTickets.find(t => t.id === id);
  if (!ticket) return null;
  Object.assign(ticket, data, { updated_at: new Date().toISOString() });
  return ticket;
}

// =============================================
// PURCHASE INQUIRIES
// =============================================
async function createInquiry(data) {
  const mapped = {
    phone: data.customer_phone || data.phone,
    customer_name: data.customer_name,
    car_interest: data.car_make ? `${data.car_make} ${data.car_model || ''}`.trim() : data.car_interest,
    budget: data.budget,
    status: 'new',
    staff_notes: data.notes || '',
  };

  if (useSupabase) {
    const { data: row, error } = await supabase
      .from('purchase_inquiries')
      .insert([mapped])
      .select()
      .single();
    if (error) { sbErr('createInquiry', error); }
    else {
      console.log(`[DB] ✅ Inquiry saved to Supabase: ${row.id}`);
      return row;
    }
  }
  const inquiry = {
    id: `INQ-${mem.counters.inquiries++}`,
    ...data,
    status: 'new',
    created_at: new Date().toISOString(),
  };
  mem.purchaseInquiries.push(inquiry);
  return inquiry;
}

async function getAllInquiries(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('purchase_inquiries').select('*').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.search) {
      q = q.or(`customer_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    }
    const { data, error } = await q;
    if (error) { sbErr('getAllInquiries', error); } else return data || [];
  }
  let result = [...mem.purchaseInquiries];
  if (filters.status) result = result.filter(i => i.status === filters.status);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(i =>
      (i.customer_name || '').toLowerCase().includes(s) ||
      (i.customer_phone || i.phone || '').includes(s)
    );
  }
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateInquiry(id, data) {
  if (useSupabase) {
    const { data: row, error } = await supabase.from('purchase_inquiries').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) { sbErr('updateInquiry', error); } else return row;
  }
  const inquiry = mem.purchaseInquiries.find(i => i.id === id);
  if (!inquiry) return null;
  Object.assign(inquiry, data, { updated_at: new Date().toISOString() });
  return inquiry;
}

// =============================================
// CONVERSATIONS
// =============================================
async function saveConversation(data) {
  const entry = {
    phone_number:     data.phone_number || data.phoneNumber,
    customer_name:    data.customer_name || data.customerName || data.phone_number,
    customer_message: data.customer_message || data.customerMessage || '',
    ai_response:      data.ai_response || data.aiResponse || '',
    response_time:    data.response_time || data.responseTime || 0,
    sentiment:        data.sentiment || 'محايد',
    topic:            data.topic || 'عام',
    escalated:        data.escalated || false,
    tools_used:       Array.isArray(data.tools_used) ? data.tools_used.join(',') : (data.tools_used || ''),
    message_id:       data.message_id || data.messageId || '',
    status:           data.status || 'delivered',
    created_at:       data.timestamp || new Date().toISOString(),
  };

  if (useSupabase) {
    // Upsert conversation thread
    const phone = entry.phone_number;
    const { data: existing } = await supabase.from('conversations').select('id,messages').eq('phone', phone).single();

    const newMsg = {
      customer: entry.customer_message,
      ai: entry.ai_response,
      tools: entry.tools_used,
      sentiment: entry.sentiment,
      topic: entry.topic,
      time: entry.created_at,
    };

    if (existing) {
      const messages = [...(existing.messages || []), newMsg].slice(-200);
      await supabase.from('conversations').update({
        messages,
        last_message: entry.customer_message,
        last_message_at: entry.created_at,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('conversations').insert([{
        phone,
        customer_name: entry.customer_name,
        messages: [newMsg],
        last_message: entry.customer_message,
        last_message_at: entry.created_at,
      }]);
    }
    return entry;
  }

  // In-memory fallback
  const memEntry = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ...entry,
  };
  mem.conversations.push(memEntry);
  if (mem.conversations.length > 2000) mem.conversations.shift();
  return memEntry;
}

async function getConversations(filters = {}) {
  if (useSupabase) {
    let q = supabase.from('conversations').select('*').order('last_message_at', { ascending: false });
    if (filters.phone_number) q = q.eq('phone', filters.phone_number);
    if (filters.limit) q = q.limit(filters.limit);
    else q = q.limit(50);
    const { data, error } = await q;
    if (error) { sbErr('getConversations', error); return []; }
    // Expand messages to flat entries for analytics compatibility
    const flat = [];
    for (const conv of data || []) {
      for (const msg of (conv.messages || [])) {
        flat.push({ phone_number: conv.phone, customer_name: conv.customer_name, ...msg, created_at: msg.time });
      }
    }
    return flat;
  }
  let result = [...mem.conversations];
  if (filters.phone_number) result = result.filter(c => c.phone_number === filters.phone_number);
  if (filters.date_from) result = result.filter(c => c.created_at >= filters.date_from);
  if (filters.date_to) result = result.filter(c => c.created_at <= filters.date_to + 'T23:59:59Z');
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (filters.limit) result = result.slice(0, filters.limit);
  return result;
}

async function getConversationsByPhone(phone) {
  if (useSupabase) {
    const { data, error } = await supabase.from('conversations').select('*').eq('phone', phone).single();
    if (error) return [];
    return (data?.messages || []).map(m => ({ ...m, phone_number: phone, created_at: m.time }));
  }
  return mem.conversations.filter(c => c.phone_number === phone).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function getGroupedConversations(limit = 50) {
  if (useSupabase) {
    const { data, error } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(limit);
    if (error) { sbErr('getGroupedConversations', error); return []; }
    return (data || []).map(conv => ({
      phone_number: conv.phone,
      customer_name: conv.customer_name,
      last_message: conv.last_message_at,
      message_count: (conv.messages || []).length,
      messages: (conv.messages || []).map(m => ({ ...m, phone_number: conv.phone, created_at: m.time })),
    }));
  }
  const grouped = {};
  const sorted = [...mem.conversations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const conv of sorted) {
    if (!grouped[conv.phone_number]) {
      grouped[conv.phone_number] = { phone_number: conv.phone_number, customer_name: conv.customer_name, last_message: conv.created_at, message_count: 0, messages: [] };
    }
    grouped[conv.phone_number].messages.push(conv);
    grouped[conv.phone_number].message_count++;
  }
  return Object.values(grouped).slice(0, limit);
}

// =============================================
// ANALYTICS & STATS
// =============================================
async function getLiveStats() {
  if (useSupabase) {
    const today = new Date().toISOString().split('T')[0];
    const [bookingsRes, carsRes, partsRes, ticketsRes, inquiriesRes, customersRes, convsRes] = await Promise.all([
      supabase.from('bookings').select('status, preferred_date'),
      supabase.from('cars').select('status'),
      supabase.from('parts').select('quantity, min_quantity'),
      supabase.from('support_tickets').select('status'),
      supabase.from('purchase_inquiries').select('status'),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('conversations').select('last_message_at', { count: 'exact', head: false }).order('last_message_at', { ascending: false }).limit(500),
    ]);

    const bookings = bookingsRes.data || [];
    const cars = carsRes.data || [];
    const parts = partsRes.data || [];
    const tickets = ticketsRes.data || [];
    const inquiries = inquiriesRes.data || [];
    const convs = convsRes.data || [];

    return {
      bookings_today:    bookings.filter(b => b.preferred_date === today && b.status !== 'cancelled').length,
      bookings_pending:  bookings.filter(b => b.status === 'pending').length,
      bookings_confirmed:bookings.filter(b => b.status === 'confirmed').length,
      bookings_total:    bookings.length,
      cars_available:    cars.filter(c => c.status === 'available').length,
      cars_reserved:     cars.filter(c => c.status === 'reserved').length,
      cars_sold:         cars.filter(c => c.status === 'sold').length,
      cars_total:        cars.length,
      parts_low_stock:   parts.filter(p => p.quantity > 0 && p.quantity <= (p.min_quantity || 5)).length,
      parts_out_of_stock:parts.filter(p => p.quantity === 0).length,
      tickets_open:      tickets.filter(t => t.status === 'open').length,
      tickets_in_progress:tickets.filter(t => t.status === 'in_progress').length,
      tickets_resolved:  tickets.filter(t => t.status === 'resolved').length,
      tickets_total:     tickets.length,
      inquiries_new:     inquiries.filter(i => i.status === 'new').length,
      inquiries_contacted:inquiries.filter(i => i.status === 'contacted').length,
      inquiries_qualified:inquiries.filter(i => i.status === 'qualified').length,
      inquiries_total:   inquiries.length,
      total_customers:   customersRes.count || 0,
      total_conversations:convsRes.count || 0,
      conversations_today:convs.filter(c => c.last_message_at?.startsWith(today)).length,
      updated_at: new Date().toISOString(),
    };
  }

  // In-memory fallback
  const today = new Date().toISOString().split('T')[0];
  return {
    bookings_today:    mem.maintenanceBookings.filter(b => b.preferred_date === today && b.status !== 'cancelled').length,
    bookings_pending:  mem.maintenanceBookings.filter(b => b.status === 'pending').length,
    bookings_confirmed:mem.maintenanceBookings.filter(b => b.status === 'confirmed').length,
    bookings_total:    mem.maintenanceBookings.length,
    cars_available:    mem.cars.filter(c => c.status === 'available').length,
    cars_reserved:     mem.cars.filter(c => c.status === 'reserved').length,
    cars_sold:         mem.cars.filter(c => c.status === 'sold').length,
    cars_total:        mem.cars.length,
    parts_low_stock:   mem.parts.filter(p => p.quantity > 0 && p.quantity <= 5).length,
    parts_out_of_stock:mem.parts.filter(p => p.quantity === 0).length,
    tickets_open:      mem.supportTickets.filter(t => t.status === 'open').length,
    tickets_in_progress:mem.supportTickets.filter(t => t.status === 'in_progress').length,
    tickets_resolved:  mem.supportTickets.filter(t => t.status === 'resolved').length,
    tickets_total:     mem.supportTickets.length,
    inquiries_new:     mem.purchaseInquiries.filter(i => i.status === 'new').length,
    inquiries_contacted:mem.purchaseInquiries.filter(i => i.status === 'contacted').length,
    inquiries_qualified:mem.purchaseInquiries.filter(i => i.status === 'qualified').length,
    inquiries_total:   mem.purchaseInquiries.length,
    total_customers:   mem.customers.size,
    total_conversations:mem.conversations.length,
    conversations_today:mem.conversations.filter(c => c.created_at?.startsWith(today)).length,
    updated_at: new Date().toISOString(),
  };
}

async function getStats() {
  const live = await getLiveStats();
  return {
    total_cars: live.cars_total,
    available_cars: live.cars_available,
    total_parts: useSupabase ? (await supabase.from('parts').select('id', { count: 'exact', head: true })).count : mem.parts.length,
    total_bookings: live.bookings_total,
    pending_bookings: live.bookings_pending,
    open_tickets: live.tickets_open,
    total_inquiries: live.inquiries_total,
    total_customers: live.total_customers,
  };
}

async function getAnalytics(from, to) {
  const convs = await getConversations({ date_from: from, date_to: to });

  const dailyMap = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().split('T')[0]] = 0;
  }
  convs.forEach(c => {
    const date = (c.created_at || c.time)?.split('T')[0];
    if (date && dailyMap.hasOwnProperty(date)) dailyMap[date]++;
  });

  const sentMap = {};
  convs.forEach(c => { sentMap[c.sentiment] = (sentMap[c.sentiment] || 0) + 1; });

  const topicMap = {};
  convs.forEach(c => { topicMap[c.topic] = (topicMap[c.topic] || 0) + 1; });

  return {
    totalMessages: convs.length,
    uniqueCustomers: new Set(convs.map(c => c.phone_number)).size,
    escalatedCount: convs.filter(c => c.escalated).length,
    avgResponseTime: convs.length > 0 ? Math.round(convs.reduce((s, c) => s + (c.response_time || 0), 0) / convs.length) : 0,
    dailyMessages: Object.entries(dailyMap).map(([date, count]) => ({ date, count })),
    sentimentCounts: Object.entries(sentMap).map(([sentiment, count]) => ({ sentiment, count })),
    topicCounts: Object.entries(topicMap).map(([topic, count]) => ({ topic, count })),
  };
}

async function getDashboardStats() {
  const [dbStats, analytics] = await Promise.all([getStats(), getAnalytics()]);
  return {
    ...dbStats,
    totalMessages: analytics.totalMessages,
    uniqueCustomers: analytics.uniqueCustomers,
    escalatedCount: analytics.escalatedCount,
    avgResponseTime: analytics.avgResponseTime,
  };
}

async function getBranchStats() {
  return BRANCHES.map(branch => ({
    ...branch,
    total_bookings: 0,
    today_bookings: 0,
    pending_bookings: 0,
    confirmed_bookings: 0,
    cars_available: mem.cars.filter(c => c.branch.includes(branch.name.split(' ')[0]) && c.status === 'available').length,
  }));
}

async function getAllBranches() {
  return BRANCHES;
}

async function getActivePromotions() {
  if (useSupabase) {
    const { data, error } = await supabase.from('promotions').select('*').eq('active', true);
    if (error) { sbErr('getActivePromotions', error); } else return data || [];
  }
  const today = new Date().toISOString().split('T')[0];
  return mem.promotions.filter(p => !p.valid_until || p.valid_until >= today);
}

// Legacy compatibility shim
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
  // Tickets
  createTicket,
  getAllTickets,
  updateTicket,
  // Inquiries
  createInquiry,
  getAllInquiries,
  updateInquiry,
  // Conversations
  saveConversation,
  getConversations,
  getConversationsByPhone,
  getGroupedConversations,
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
