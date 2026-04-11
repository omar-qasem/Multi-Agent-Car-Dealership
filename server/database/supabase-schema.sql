-- ================================================================
-- Auto Jordan WhatsApp AI System - Comprehensive Supabase Schema
-- ================================================================
-- Run this in your Supabase SQL Editor ONCE to create all tables.
-- Uses UUID primary keys to match Supabase's native type system.
-- ================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- DROP EXISTING TABLES (clean slate — CASCADE removes FKs first)
-- Safe to run on a fresh project or to reset an existing one.
-- ================================================================
DROP TABLE IF EXISTS messages           CASCADE;
DROP TABLE IF EXISTS purchase_inquiries CASCADE;
DROP TABLE IF EXISTS support_tickets    CASCADE;
DROP TABLE IF EXISTS bookings           CASCADE;
DROP TABLE IF EXISTS customers          CASCADE;
DROP TABLE IF EXISTS promotions         CASCADE;
DROP TABLE IF EXISTS parts              CASCADE;
DROP TABLE IF EXISTS cars               CASCADE;

-- ================================================================
-- 1. CARS TABLE
-- ================================================================
CREATE TABLE cars (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER NOT NULL,
  color           TEXT,
  price           NUMERIC(12,2) NOT NULL,
  mileage         INTEGER DEFAULT 0,
  condition       TEXT DEFAULT 'new' CHECK (condition IN ('new','used')),
  status          TEXT DEFAULT 'available' CHECK (status IN ('available','reserved','sold')),
  branch          TEXT DEFAULT 'عمان',
  fuel_type       TEXT DEFAULT 'بنزين',
  transmission    TEXT DEFAULT 'أوتوماتيك',
  engine          TEXT,
  features        TEXT,
  description     TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 2. PARTS TABLE
-- ================================================================
CREATE TABLE parts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  part_number     TEXT,
  category        TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity        INTEGER NOT NULL DEFAULT 0,
  min_quantity    INTEGER DEFAULT 5,
  location        TEXT,
  supplier        TEXT,
  compatible      TEXT[] DEFAULT '{}',
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 3. CUSTOMERS TABLE
-- ================================================================
CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT UNIQUE NOT NULL,
  name            TEXT,
  email           TEXT,
  city            TEXT,
  car_make        TEXT,
  car_model       TEXT,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  loyalty_points  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 4. BOOKINGS TABLE
-- ================================================================
CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone  TEXT NOT NULL,
  customer_name   TEXT,
  car_make        TEXT,
  car_model       TEXT,
  car_year        INTEGER,
  service_type    TEXT,
  booking_type    TEXT DEFAULT 'service' CHECK (booking_type IN ('test_drive','purchase','service','consultation')),
  preferred_date  TEXT,
  preferred_time  TEXT,
  branch          TEXT DEFAULT 'عمان',
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes           TEXT,
  staff_notes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 5. SUPPORT TICKETS TABLE
-- ================================================================
CREATE TABLE support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone    TEXT NOT NULL,
  customer_name     TEXT,
  subject           TEXT,
  issue_description TEXT NOT NULL,
  category          TEXT DEFAULT 'general',
  priority          TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status            TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  staff_notes       TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 6. PURCHASE INQUIRIES TABLE
-- ================================================================
CREATE TABLE purchase_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone  TEXT NOT NULL,
  customer_name   TEXT,
  car_make        TEXT,
  car_model       TEXT,
  budget          NUMERIC(12,2),
  financing       BOOLEAN DEFAULT FALSE,
  trade_in        BOOLEAN DEFAULT FALSE,
  timeline        TEXT,
  status          TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed')),
  notes           TEXT,
  staff_notes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 7. MESSAGES TABLE
-- ================================================================
CREATE TABLE messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number      TEXT NOT NULL,
  customer_id       uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     TEXT,
  customer_message  TEXT,
  ai_response       TEXT,
  response_time     INTEGER DEFAULT 0,
  sentiment         TEXT DEFAULT 'محايد',
  topic             TEXT DEFAULT 'عام',
  intent            TEXT,
  tools_used        TEXT,
  escalated         BOOLEAN DEFAULT FALSE,
  message_id        TEXT,
  status            TEXT DEFAULT 'delivered',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 8. PROMOTIONS TABLE
-- ================================================================
CREATE TABLE promotions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  discount_type   TEXT DEFAULT 'offer',
  discount_value  NUMERIC(10,2),
  applies_to      TEXT,
  valid_from      DATE,
  valid_until     DATE,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES (performance)
-- ================================================================
CREATE INDEX idx_cars_status          ON cars(status);
CREATE INDEX idx_cars_make_model      ON cars(make, model);
CREATE INDEX idx_cars_branch          ON cars(branch);
CREATE INDEX idx_parts_name           ON parts(name);
CREATE INDEX idx_parts_category       ON parts(category);
CREATE INDEX idx_customers_phone      ON customers(phone);
CREATE INDEX idx_bookings_status      ON bookings(status);
CREATE INDEX idx_bookings_phone       ON bookings(customer_phone);
CREATE INDEX idx_bookings_created     ON bookings(created_at DESC);
CREATE INDEX idx_tickets_status       ON support_tickets(status);
CREATE INDEX idx_tickets_phone        ON support_tickets(customer_phone);
CREATE INDEX idx_inquiries_status     ON purchase_inquiries(status);
CREATE INDEX idx_inquiries_phone      ON purchase_inquiries(customer_phone);
CREATE INDEX idx_messages_phone       ON messages(phone_number);
CREATE INDEX idx_messages_created     ON messages(created_at DESC);
CREATE INDEX idx_messages_topic       ON messages(topic);
CREATE INDEX idx_messages_sentiment   ON messages(sentiment);
CREATE INDEX idx_promotions_active    ON promotions(active);

-- ================================================================
-- ROW LEVEL SECURITY
-- service_role key (used by backend) bypasses RLS automatically.
-- Anon key has NO access.
-- ================================================================
ALTER TABLE cars               ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions         ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- SEED DATA — CARS
-- ================================================================
INSERT INTO cars (make, model, year, color, price, mileage, condition, status, branch, fuel_type, transmission, engine, features) VALUES
('Toyota',  'Camry',        2024, 'أبيض لؤلؤي', 18500, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '2.5L',        'كاميرا خلفية، شاشة لمس، كروز كنترول، نظام ملاحة'),
('Toyota',  'Camry',        2024, 'أسود',       18500, 0,     'new',  'available', 'إربد',    'بنزين', 'أوتوماتيك', '2.5L',        'كاميرا خلفية، شاشة لمس، كروز كنترول'),
('Toyota',  'Land Cruiser', 2023, 'أبيض',       58000, 35000, 'used', 'available', 'عمان',    'بنزين', 'أوتوماتيك', '4.0L',        'فل أوبشن، 4WD، 7 مقاعد، نظام ملاحة'),
('Toyota',  'Corolla',      2024, 'فضي',        14500, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '1.6L',        'كاميرا خلفية، بلوتوث، مكيف'),
('Toyota',  'Corolla',      2022, 'أبيض',       11800, 42000, 'used', 'available', 'الزرقاء', 'بنزين', 'أوتوماتيك', '1.6L',        'بلوتوث، مكيف، كاميرا خلفية'),
('Toyota',  'RAV4',         2024, 'أحمر',       22000, 0,     'new',  'available', 'عمان',    'هجين',  'أوتوماتيك', '2.5L Hybrid', 'AWD، شاشة لمس، كاميرا 360'),
('Hyundai', 'Tucson',       2024, 'رمادي',      16800, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '1.6T',        'بانورامك، شاشة لمس، كاميرا 360، كروز'),
('Hyundai', 'Elantra',      2024, 'أزرق',       13200, 0,     'new',  'available', 'إربد',    'بنزين', 'أوتوماتيك', '1.6L',        'كاميرا خلفية، بلوتوث، شاشة لمس'),
('Hyundai', 'Santa Fe',     2023, 'أسود',       28500, 18000, 'used', 'available', 'عمان',    'بنزين', 'أوتوماتيك', '2.5T',        '7 مقاعد، AWD، فل أوبشن'),
('Kia',     'Sportage',     2024, 'أبيض',       17200, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '1.6T',        'بانورامك، كاميرا 360، شاشة 12 بوصة'),
('Kia',     'Cerato',       2024, 'رمادي',      12800, 0,     'new',  'available', 'الزرقاء', 'بنزين', 'أوتوماتيك', '1.6L',        'كاميرا خلفية، شاشة لمس، بلوتوث'),
('MG',      'ZS',           2024, 'أبيض',       12500, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '1.5T',        'شاشة لمس كبيرة، كاميرا خلفية، كروز'),
('MG',      'HS',           2024, 'رمادي',      15800, 0,     'new',  'available', 'عمان',    'بنزين', 'أوتوماتيك', '2.0T',        'بانورامك، كاميرا 360، AWD'),
('Nissan',  'Sunny',        2024, 'أبيض',        9800, 0,     'new',  'available', 'العقبة',  'بنزين', 'أوتوماتيك', '1.5L',        'مكيف، بلوتوث، كاميرا خلفية'),
('Nissan',  'Altima',       2023, 'أسود',       16500, 22000, 'used', 'available', 'عمان',    'بنزين', 'أوتوماتيك', '2.5L',        'كروز، كاميرا خلفية، شاشة لمس'),
('BMW',     '320i',         2022, 'أبيض',       32000, 28000, 'used', 'available', 'عمان',    'بنزين', 'أوتوماتيك', '2.0T',        'فل أوبشن، نظام ملاحة، جلد'),
('Chery',   'Tiggo 8 Pro',  2024, 'أبيض',       14800, 0,     'new',  'available', 'إربد',    'بنزين', 'أوتوماتيك', '1.6T',        '7 مقاعد، بانورامك، شاشة كبيرة');

-- ================================================================
-- SEED DATA — PARTS
-- ================================================================
INSERT INTO parts (name, part_number, category, price, quantity, min_quantity, location, compatible) VALUES
('فلتر زيت',             'OIL-TOY-001',  'فلاتر',    8,   45, 10, 'رف A1', ARRAY['Toyota Camry','Toyota Corolla','Toyota RAV4']),
('فلتر زيت',             'OIL-HYU-001',  'فلاتر',    7,   32, 10, 'رف A2', ARRAY['Hyundai Tucson','Hyundai Elantra','Hyundai Santa Fe']),
('فلتر هواء',            'AIR-TOY-001',  'فلاتر',    12,  20, 10, 'رف A3', ARRAY['Toyota Camry','Toyota Corolla']),
('فلتر هواء',            'AIR-KIA-001',  'فلاتر',    11,  15, 10, 'رف A4', ARRAY['Kia Sportage','Kia Cerato']),
('فلتر مكيف',            'CAB-TOY-001',  'فلاتر',    9,   28, 10, 'رف A5', ARRAY['Toyota Camry','Toyota Corolla','Toyota RAV4']),
('بطارية 60 أمبير',      'BAT-60-001',   'بطاريات',  65,  8,  5,  'رف B1', ARRAY['Nissan Sunny','Hyundai Elantra','Kia Cerato']),
('بطارية 75 أمبير',      'BAT-75-001',   'بطاريات',  85,  12, 5,  'رف B2', ARRAY['Toyota Camry','Toyota Corolla','Hyundai Tucson']),
('بطارية 90 أمبير',      'BAT-90-001',   'بطاريات',  110, 5,  3,  'رف B3', ARRAY['Toyota Land Cruiser','Hyundai Santa Fe','BMW 320i']),
('بريك باد أمامي',       'BRK-TOY-F001', 'بريك',     35,  18, 6,  'رف C1', ARRAY['Toyota Camry','Toyota Corolla']),
('بريك باد خلفي',        'BRK-TOY-R001', 'بريك',     28,  14, 6,  'رف C2', ARRAY['Toyota Camry','Toyota Corolla']),
('بريك باد أمامي',       'BRK-HYU-F001', 'بريك',     32,  10, 5,  'رف C3', ARRAY['Hyundai Tucson','Hyundai Elantra']),
('قرص بريك أمامي',       'DSC-TOY-F001', 'بريك',     55,  6,  3,  'رف C4', ARRAY['Toyota Camry','Toyota RAV4']),
('إطار 195/65R15',       'TYR-195-65-15','إطارات',   45,  16, 8,  'رف D1', ARRAY['Toyota Corolla','Hyundai Elantra','Kia Cerato']),
('إطار 215/55R17',       'TYR-215-55-17','إطارات',   62,  20, 8,  'رف D2', ARRAY['Toyota Camry','Hyundai Tucson','Kia Sportage']),
('إطار 265/70R17',       'TYR-265-70-17','إطارات',   95,  8,  4,  'رف D3', ARRAY['Toyota Land Cruiser','Hyundai Santa Fe']),
('شمعات NGK (طقم)',      'SPK-NGK-001',  'شمعات',    22,  25, 8,  'رف E1', ARRAY['Toyota Camry','Toyota Corolla','Nissan Sunny']),
('شمعات بوش (طقم)',      'SPK-BSH-001',  'شمعات',    28,  15, 6,  'رف E2', ARRAY['Hyundai Tucson','Kia Sportage','BMW 320i']),
('زيت محرك 5W-30 (4L)',  'OIL-5W30-4L',  'زيوت',     18,  60, 15, 'رف F1', ARRAY['جميع السيارات']),
('زيت محرك 0W-20 (4L)',  'OIL-0W20-4L',  'زيوت',     24,  30, 10, 'رف F2', ARRAY['Toyota Camry 2020+','Toyota RAV4 Hybrid']);

-- ================================================================
-- SEED DATA — PROMOTIONS
-- ================================================================
INSERT INTO promotions (title, description, applies_to, valid_until, active) VALUES
('عرض رمضان الكريم 🌙',     'خصم 500 دينار على جميع السيارات الجديدة + 3 سنوات كفالة مجانية', 'جميع السيارات الجديدة', '2026-04-30', true),
('عرض فحص مجاني',          'فحص شامل مجاني 21 نقطة مع كل موعد صيانة',                         'جميع العملاء',          '2026-06-30', true),
('تقسيط بدون فوائد',       'تقسيط حتى 60 شهراً بدون فوائد على سيارات MG و Chery',              'MG & Chery',            '2026-05-31', true),
('استبدال سيارتك القديمة', 'نشتري سيارتك القديمة بأفضل سعر ونستبدلها بجديدة',                 'جميع العملاء',          '2026-12-31', true);

-- ================================================================
-- DONE — verify with:
--   SELECT COUNT(*) FROM cars;         -- expect 17
--   SELECT COUNT(*) FROM parts;        -- expect 19
--   SELECT COUNT(*) FROM promotions;   -- expect 4
-- ================================================================
