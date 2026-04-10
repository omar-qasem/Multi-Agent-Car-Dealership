-- =============================================
-- أوتو جوردن - قاعدة بيانات متجر السيارات
-- Auto Jordan Car Dealership Database
-- =============================================

-- تفعيل المفاتيح الأجنبية
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================
-- 1. الأفرع - Branches
-- =============================================
CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_en TEXT,
    governorate TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT,
    email TEXT,
    manager_name TEXT,
    working_hours_weekday TEXT DEFAULT '08:00-18:00',
    working_hours_friday TEXT DEFAULT '08:00-14:00',
    working_hours_saturday TEXT DEFAULT '08:00-16:00',
    is_main_branch INTEGER DEFAULT 0,
    has_showroom INTEGER DEFAULT 1,
    has_service_center INTEGER DEFAULT 1,
    has_parts_shop INTEGER DEFAULT 1,
    has_body_shop INTEGER DEFAULT 0,
    latitude REAL,
    longitude REAL,
    google_maps_link TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'under_renovation')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 2. الموظفين - Employees
-- =============================================
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('manager', 'sales', 'mechanic', 'parts_specialist', 'receptionist', 'accountant', 'body_shop_tech', 'electrician', 'wash_tech')),
    phone TEXT,
    email TEXT,
    specialization TEXT,
    is_available INTEGER DEFAULT 1,
    hire_date DATE,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'on_leave', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- 3. العملاء - Customers
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    whatsapp TEXT,
    email TEXT,
    national_id TEXT,
    address TEXT,
    city TEXT,
    preferred_branch_id INTEGER,
    customer_type TEXT DEFAULT 'individual' CHECK(customer_type IN ('individual', 'corporate', 'fleet', 'vip')),
    loyalty_points INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (preferred_branch_id) REFERENCES branches(id)
);

-- =============================================
-- 4. سيارات العملاء - Customer Vehicles
-- =============================================
CREATE TABLE IF NOT EXISTS customer_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    color TEXT,
    vin TEXT UNIQUE,
    plate_number TEXT,
    engine_type TEXT CHECK(engine_type IN ('petrol', 'diesel', 'hybrid', 'electric', 'lpg')),
    engine_size TEXT,
    transmission TEXT CHECK(transmission IN ('automatic', 'manual', 'cvt')),
    mileage INTEGER DEFAULT 0,
    last_service_date DATE,
    last_service_mileage INTEGER,
    insurance_expiry DATE,
    registration_expiry DATE,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'sold', 'scrapped')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- =============================================
-- 5. معرض السيارات - Car Inventory (سيارات للبيع)
-- =============================================
CREATE TABLE IF NOT EXISTS car_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    trim_level TEXT,
    color_exterior TEXT,
    color_interior TEXT,
    vin TEXT UNIQUE,
    engine_type TEXT CHECK(engine_type IN ('petrol', 'diesel', 'hybrid', 'electric', 'lpg')),
    engine_size TEXT,
    transmission TEXT CHECK(transmission IN ('automatic', 'manual', 'cvt')),
    drivetrain TEXT CHECK(drivetrain IN ('fwd', 'rwd', 'awd', '4wd')),
    mileage INTEGER DEFAULT 0,
    condition TEXT CHECK(condition IN ('new', 'used', 'certified_preowned')),
    price REAL NOT NULL,
    original_price REAL,
    discount_percentage REAL DEFAULT 0,
    monthly_installment REAL,
    installment_months INTEGER,
    features TEXT, -- JSON array of features
    body_type TEXT CHECK(body_type IN ('sedan', 'suv', 'hatchback', 'pickup', 'van', 'coupe', 'convertible', 'wagon', 'crossover', 'bus')),
    seats INTEGER,
    fuel_consumption TEXT,
    origin_country TEXT,
    customs_cleared INTEGER DEFAULT 1,
    warranty_months INTEGER DEFAULT 0,
    warranty_km INTEGER DEFAULT 0,
    images TEXT, -- JSON array of image URLs
    video_url TEXT,
    is_featured INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'reserved', 'sold', 'in_transit', 'under_inspection')),
    added_date DATE DEFAULT CURRENT_DATE,
    sold_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- 6. قطع الغيار - Parts Inventory
-- =============================================
CREATE TABLE IF NOT EXISTS parts_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_en TEXT,
    parent_id INTEGER,
    description TEXT,
    FOREIGN KEY (parent_id) REFERENCES parts_categories(id)
);

CREATE TABLE IF NOT EXISTS parts_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    category_id INTEGER,
    part_number TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    brand TEXT NOT NULL,
    oem_number TEXT,
    compatible_makes TEXT, -- JSON array: ["Toyota", "Lexus"]
    compatible_models TEXT, -- JSON array: ["Camry", "Corolla"]
    compatible_years TEXT, -- JSON range: "2018-2024"
    condition TEXT DEFAULT 'new' CHECK(condition IN ('new', 'used', 'refurbished')),
    quality TEXT DEFAULT 'genuine' CHECK(quality IN ('genuine', 'aftermarket', 'oem')),
    quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 2,
    price REAL NOT NULL,
    cost_price REAL,
    weight_kg REAL,
    location_in_store TEXT,
    warranty_months INTEGER DEFAULT 0,
    image_url TEXT,
    is_critical INTEGER DEFAULT 0,
    last_restock_date DATE,
    status TEXT DEFAULT 'in_stock' CHECK(status IN ('in_stock', 'low_stock', 'out_of_stock', 'discontinued', 'on_order')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES parts_categories(id)
);

-- =============================================
-- 7. خدمات الصيانة المتوفرة - Service Types
-- =============================================
CREATE TABLE IF NOT EXISTS service_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_en TEXT,
    category TEXT NOT NULL CHECK(category IN ('routine', 'repair', 'body', 'electrical', 'tire', 'ac', 'diagnostic', 'wash', 'custom')),
    description TEXT,
    estimated_duration_minutes INTEGER,
    base_price REAL NOT NULL,
    requires_appointment INTEGER DEFAULT 1,
    requires_parts INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    priority_level TEXT DEFAULT 'normal' CHECK(priority_level IN ('low', 'normal', 'high', 'urgent')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 8. مواعيد الصيانة - Maintenance Appointments
-- =============================================
CREATE TABLE IF NOT EXISTS maintenance_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    service_type_id INTEGER,
    assigned_mechanic_id INTEGER,
    appointment_date DATE NOT NULL,
    appointment_time TEXT NOT NULL,
    end_time TEXT,
    description TEXT,
    customer_notes TEXT,
    mechanic_notes TEXT,
    estimated_cost REAL,
    actual_cost REAL,
    mileage_at_service INTEGER,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'confirmed', 'in_progress', 'waiting_parts', 'completed', 'cancelled', 'no_show')),
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'partial', 'paid', 'refunded')),
    payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'bank_transfer', 'installment')),
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    feedback TEXT,
    reminder_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (vehicle_id) REFERENCES customer_vehicles(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (service_type_id) REFERENCES service_types(id),
    FOREIGN KEY (assigned_mechanic_id) REFERENCES employees(id)
);

-- =============================================
-- 9. تفاصيل الصيانة - Service Line Items
-- =============================================
CREATE TABLE IF NOT EXISTS service_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    service_type_id INTEGER,
    part_id INTEGER,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    type TEXT CHECK(type IN ('service', 'part', 'labor', 'other')),
    FOREIGN KEY (appointment_id) REFERENCES maintenance_appointments(id),
    FOREIGN KEY (service_type_id) REFERENCES service_types(id),
    FOREIGN KEY (part_id) REFERENCES parts_inventory(id)
);

-- =============================================
-- 10. سجل الصيانة - Service History
-- =============================================
CREATE TABLE IF NOT EXISTS service_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER,
    customer_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    service_date DATE NOT NULL,
    service_summary TEXT NOT NULL,
    total_cost REAL,
    mileage INTEGER,
    next_service_date DATE,
    next_service_mileage INTEGER,
    next_service_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES maintenance_appointments(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (vehicle_id) REFERENCES customer_vehicles(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- 11. تذاكر الدعم - Support Tickets
-- =============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    branch_id INTEGER,
    category TEXT NOT NULL CHECK(category IN ('complaint', 'inquiry', 'suggestion', 'maintenance_issue', 'sales_inquiry', 'parts_inquiry', 'escalation', 'other')),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
    assigned_to INTEGER,
    resolution TEXT,
    source TEXT DEFAULT 'whatsapp' CHECK(source IN ('whatsapp', 'phone', 'email', 'walk_in', 'website')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (assigned_to) REFERENCES employees(id)
);

-- =============================================
-- 12. العروض والحملات - Promotions
-- =============================================
CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('discount', 'package', 'seasonal', 'loyalty', 'trade_in', 'financing', 'free_service')),
    discount_percentage REAL,
    discount_amount REAL,
    applicable_to TEXT CHECK(applicable_to IN ('cars', 'parts', 'services', 'all')),
    applicable_makes TEXT, -- JSON array
    applicable_models TEXT, -- JSON array
    min_purchase REAL,
    promo_code TEXT,
    branch_id INTEGER, -- NULL = all branches
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    terms_conditions TEXT,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- 13. المحادثات - Conversations
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    customer_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    response_time INTEGER, -- milliseconds
    sentiment TEXT DEFAULT 'محايد',
    topic TEXT DEFAULT 'عام',
    intent TEXT, -- detected intent
    tools_used TEXT, -- JSON array of tools used
    escalated INTEGER DEFAULT 0,
    message_id TEXT,
    status TEXT DEFAULT 'sent',
    branch_context INTEGER, -- which branch context
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (branch_context) REFERENCES branches(id)
);

-- =============================================
-- 14. طلبات الشراء - Purchase Inquiries
-- =============================================
CREATE TABLE IF NOT EXISTS purchase_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    car_inventory_id INTEGER,
    inquiry_type TEXT CHECK(inquiry_type IN ('buy', 'test_drive', 'financing', 'trade_in', 'lease')),
    budget_min REAL,
    budget_max REAL,
    preferred_makes TEXT, -- JSON
    preferred_models TEXT, -- JSON
    preferred_year_min INTEGER,
    preferred_year_max INTEGER,
    preferred_condition TEXT,
    trade_in_vehicle TEXT, -- description of trade-in
    financing_needed INTEGER DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'test_drive_scheduled', 'negotiating', 'closed_won', 'closed_lost')),
    assigned_to INTEGER,
    follow_up_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (car_inventory_id) REFERENCES car_inventory(id),
    FOREIGN KEY (assigned_to) REFERENCES employees(id)
);

-- =============================================
-- 15. تقييمات العملاء - Customer Reviews
-- =============================================
CREATE TABLE IF NOT EXISTS customer_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    branch_id INTEGER,
    type TEXT CHECK(type IN ('service', 'sales', 'parts', 'general')),
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    review_text TEXT,
    response_text TEXT,
    is_public INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- 16. سجل التنبيهات - Notifications Log
-- =============================================
CREATE TABLE IF NOT EXISTS notifications_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    phone TEXT NOT NULL,
    type TEXT CHECK(type IN ('appointment_reminder', 'service_complete', 'promotion', 'follow_up', 'insurance_expiry', 'registration_expiry', 'next_service')),
    message TEXT NOT NULL,
    sent_via TEXT DEFAULT 'whatsapp',
    status TEXT DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- =============================================
-- INDEXES for Performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer ON customer_vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_car_inventory_branch ON car_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_car_inventory_status ON car_inventory(status);
CREATE INDEX IF NOT EXISTS idx_car_inventory_make_model ON car_inventory(make, model);
CREATE INDEX IF NOT EXISTS idx_car_inventory_price ON car_inventory(price);
CREATE INDEX IF NOT EXISTS idx_car_inventory_condition ON car_inventory(condition);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_branch ON parts_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_part_number ON parts_inventory(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_compatible ON parts_inventory(compatible_makes);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON maintenance_appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON maintenance_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON maintenance_appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON maintenance_appointments(status);
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON support_tickets(customer_phone);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_service_history_vehicle ON service_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_purchase_inquiries_status ON purchase_inquiries(status);
