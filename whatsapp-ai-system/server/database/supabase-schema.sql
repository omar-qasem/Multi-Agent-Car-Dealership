-- ============================================================
-- Auto Jordan WhatsApp AI System - Supabase Schema
-- Run this in your Supabase SQL Editor once
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CARS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cars (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  year          INTEGER NOT NULL,
  color         TEXT,
  price         NUMERIC(12,2) NOT NULL,
  mileage       INTEGER DEFAULT 0,
  fuel_type     TEXT DEFAULT 'بنزين',
  transmission  TEXT DEFAULT 'أوتوماتيك',
  status        TEXT DEFAULT 'available' CHECK (status IN ('available','reserved','sold')),
  branch        TEXT DEFAULT 'الرئيسي',
  description   TEXT,
  image_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS parts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  part_number   TEXT,
  price         NUMERIC(10,2) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  min_quantity  INTEGER DEFAULT 5,
  supplier      TEXT,
  compatible_models TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone         TEXT UNIQUE NOT NULL,
  name          TEXT,
  email         TEXT,
  city          TEXT,
  notes         TEXT,
  tags          TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  messages      JSONB DEFAULT '[]',
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','closed')),
  last_message  TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOOKINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  customer_name TEXT,
  car_id        UUID REFERENCES cars(id) ON DELETE SET NULL,
  car_details   TEXT,
  booking_type  TEXT DEFAULT 'test_drive' CHECK (booking_type IN ('test_drive','purchase','service','consultation')),
  preferred_date TEXT,
  preferred_time TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes         TEXT,
  staff_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPORT TICKETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  customer_name TEXT,
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT DEFAULT 'general' CHECK (category IN ('general','technical','complaint','inquiry','warranty')),
  priority      TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status        TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  staff_notes   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PURCHASE INQUIRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_inquiries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  customer_name TEXT,
  car_interest  TEXT,
  budget        TEXT,
  financing     BOOLEAN DEFAULT FALSE,
  trade_in      BOOLEAN DEFAULT FALSE,
  timeline      TEXT,
  status        TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed')),
  staff_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROMOTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS promotions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage','fixed','offer')),
  discount_value NUMERIC(10,2),
  applicable_to TEXT,
  valid_from    DATE,
  valid_until   DATE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cars_status      ON cars(status);
CREATE INDEX IF NOT EXISTS idx_cars_make_model  ON cars(make, model);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_phone   ON bookings(phone);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_phone    ON support_tickets(phone);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON purchase_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_phone  ON purchase_inquiries(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(phone);

-- ============================================================
-- SEED DATA - CARS
-- ============================================================
INSERT INTO cars (make, model, year, color, price, mileage, fuel_type, transmission, status, branch) VALUES
('تويوتا', 'كامري', 2023, 'أبيض', 28000, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي'),
('تويوتا', 'كامري', 2023, 'أسود', 28500, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي'),
('تويوتا', 'لاند كروزر', 2024, 'أبيض', 85000, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي'),
('تويوتا', 'RAV4', 2023, 'رمادي', 35000, 0, 'هجين', 'أوتوماتيك', 'available', 'الرئيسي'),
('تويوتا', 'هايلاندر', 2023, 'أبيض', 55000, 0, 'بنزين', 'أوتوماتيك', 'available', 'فرع 2'),
('هوندا', 'أكورد', 2023, 'فضي', 32000, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي'),
('هوندا', 'CR-V', 2023, 'أزرق', 38000, 0, 'هجين', 'أوتوماتيك', 'available', 'فرع 2'),
('نيسان', 'باترول', 2023, 'أسود', 72000, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي'),
('نيسان', 'صني', 2023, 'أبيض', 18000, 0, 'بنزين', 'أوتوماتيك', 'available', 'فرع 2'),
('كيا', 'سبورتاج', 2024, 'أحمر', 33000, 0, 'بنزين', 'أوتوماتيك', 'available', 'الرئيسي')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED DATA - PARTS
-- ============================================================
INSERT INTO parts (name, category, part_number, price, quantity, min_quantity, supplier) VALUES
('فلتر زيت تويوتا', 'فلاتر', 'TOY-OIL-001', 15, 50, 10, 'تويوتا الأردن'),
('تيل أمامي كامري 2022-2024', 'فرامل', 'CAM-BRK-F22', 120, 8, 5, 'تويوتا الأردن'),
('بطارية 70 أمبير', 'كهرباء', 'BAT-70A', 85, 3, 5, 'موردين'),
('زيت محرك 5W-30 (4L)', 'زيوت', 'OIL-5W30-4L', 35, 100, 20, 'شل الأردن'),
('إطار 215/55R17', 'إطارات', 'TIR-21555R17', 95, 2, 8, 'برجستون'),
('فلتر هواء', 'فلاتر', 'AIR-FLT-001', 25, 30, 10, 'متعدد'),
('شمعات إشعال', 'محرك', 'SPK-NGK-001', 45, 20, 8, 'NGK'),
('حزام توقيت', 'محرك', 'TIM-BLT-001', 180, 0, 3, 'متعدد'),
('صدام أمامي كامري', 'هيكل', 'CAM-BMF-001', 350, 2, 2, 'تويوتا الأردن'),
('مرآة جانبية يسار', 'هيكل', 'MIR-LFT-001', 220, 4, 2, 'متعدد')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED DATA - PROMOTIONS
-- ============================================================
INSERT INTO promotions (title, description, discount_type, discount_value, applicable_to, valid_until, active) VALUES
('خصم رمضان 10%', 'خصم خاص بمناسبة شهر رمضان المبارك على جميع السيارات', 'percentage', 10, 'جميع السيارات', '2025-04-30', true),
('صيانة مجانية', 'صيانة مجانية عند شراء أي سيارة جديدة', 'offer', NULL, 'سيارات جديدة', '2025-12-31', true),
('تمويل بدون فوائد 6 أشهر', 'تمويل بدون فوائد لمدة 6 أشهر على المركبات المختارة', 'offer', NULL, 'مركبات مختارة', '2025-06-30', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Service Key bypasses these
-- ============================================================
ALTER TABLE cars               ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions         ENABLE ROW LEVEL SECURITY;

-- Allow service role (backend) to do everything
CREATE POLICY "service_all" ON cars               FOR ALL USING (true);
CREATE POLICY "service_all" ON parts              FOR ALL USING (true);
CREATE POLICY "service_all" ON customers          FOR ALL USING (true);
CREATE POLICY "service_all" ON conversations      FOR ALL USING (true);
CREATE POLICY "service_all" ON bookings           FOR ALL USING (true);
CREATE POLICY "service_all" ON support_tickets    FOR ALL USING (true);
CREATE POLICY "service_all" ON purchase_inquiries FOR ALL USING (true);
CREATE POLICY "service_all" ON promotions         FOR ALL USING (true);
