-- =============================================
-- أوتو جوردن - بيانات أولية شاملة
-- Auto Jordan Seed Data
-- =============================================

-- =============================================
-- الأفرع - 4 أفرع بالمحافظات
-- =============================================
INSERT INTO branches (name, name_en, governorate, city, address, phone, whatsapp, email, manager_name, working_hours_weekday, working_hours_friday, working_hours_saturday, is_main_branch, has_showroom, has_service_center, has_parts_shop, has_body_shop, latitude, longitude, google_maps_link) VALUES
('أوتو جوردن - الفرع الرئيسي', 'Auto Jordan - Main Branch', 'عمان', 'عمان', 'شارع المدينة المنورة، بجانب مجمع جبر، عمان', '06-5000001', '962790000001', 'amman@autojordan.jo', 'م. خالد الزعبي', '08:00-20:00', '08:00-14:00', '08:00-18:00', 1, 1, 1, 1, 1, 31.9539, 35.9106, 'https://maps.google.com/?q=31.9539,35.9106'),
('أوتو جوردن - فرع إربد', 'Auto Jordan - Irbid Branch', 'إربد', 'إربد', 'شارع الحصن، مقابل مجمع عمان، إربد', '02-7000001', '962790000002', 'irbid@autojordan.jo', 'أحمد النعيمات', '08:00-19:00', '08:00-14:00', '08:00-17:00', 0, 1, 1, 1, 0, 32.5568, 35.8469, 'https://maps.google.com/?q=32.5568,35.8469'),
('أوتو جوردن - فرع الزرقاء', 'Auto Jordan - Zarqa Branch', 'الزرقاء', 'الزرقاء', 'شارع الملك عبدالله الثاني، الزرقاء الجديدة', '05-3000001', '962790000003', 'zarqa@autojordan.jo', 'محمد العبادي', '08:00-19:00', '08:00-14:00', '08:00-17:00', 0, 1, 1, 1, 0, 32.0608, 36.0880, 'https://maps.google.com/?q=32.0608,36.0880'),
('أوتو جوردن - فرع العقبة', 'Auto Jordan - Aqaba Branch', 'العقبة', 'العقبة', 'شارع الملك حسين، منطقة المنارة، العقبة', '03-2000001', '962790000004', 'aqaba@autojordan.jo', 'سامر الخطيب', '08:00-19:00', '08:00-14:00', '08:00-17:00', 0, 1, 1, 1, 0, 29.5321, 35.0063, 'https://maps.google.com/?q=29.5321,35.0063');

-- =============================================
-- الموظفين - فريق العمل
-- =============================================
-- فرع عمان (الرئيسي)
INSERT INTO employees (branch_id, name, role, phone, email, specialization, hire_date) VALUES
(1, 'م. خالد الزعبي', 'manager', '0790100001', 'khalid@autojordan.jo', 'إدارة عامة', '2018-01-15'),
(1, 'عمر الحسن', 'sales', '0790100002', 'omar.h@autojordan.jo', 'سيارات يابانية', '2019-03-01'),
(1, 'ياسر المومني', 'sales', '0790100003', 'yaser@autojordan.jo', 'سيارات كورية وصينية', '2020-06-15'),
(1, 'ليث القاضي', 'sales', '0790100004', 'laith@autojordan.jo', 'سيارات ألمانية وأوروبية', '2019-11-01'),
(1, 'م. فادي الشمايلة', 'mechanic', '0790100005', 'fadi@autojordan.jo', 'ميكانيك عام - تويوتا وهوندا', '2017-05-01'),
(1, 'م. رائد الطراونة', 'mechanic', '0790100006', 'raed@autojordan.jo', 'ميكانيك هيونداي وكيا', '2018-09-01'),
(1, 'م. باسل الحوراني', 'mechanic', '0790100007', 'basel@autojordan.jo', 'ميكانيك أوروبي - BMW و Mercedes', '2019-02-01'),
(1, 'م. نضال أبو ليلى', 'mechanic', '0790100008', 'nidal@autojordan.jo', 'ميكانيك ديزل وشاحنات', '2016-08-01'),
(1, 'حسام الدبعي', 'electrician', '0790100009', 'husam@autojordan.jo', 'كهرباء سيارات وبرمجة كمبيوتر', '2019-04-01'),
(1, 'وليد جبر', 'parts_specialist', '0790100010', 'walid@autojordan.jo', 'قطع غيار يابانية وكورية', '2018-07-01'),
(1, 'سعد الفقير', 'parts_specialist', '0790100011', 'saad@autojordan.jo', 'قطع غيار أوروبية', '2020-01-15'),
(1, 'رنا العمري', 'receptionist', '0790100012', 'rana@autojordan.jo', 'استقبال وخدمة عملاء', '2021-03-01'),
(1, 'م. طارق الصمادي', 'body_shop_tech', '0790100013', 'tariq@autojordan.jo', 'سمكرة ودهان', '2017-11-01'),
(1, 'م. زيد الكيلاني', 'body_shop_tech', '0790100014', 'zaid@autojordan.jo', 'سمكرة وتلميع', '2019-06-01'),
(1, 'إبراهيم النسور', 'wash_tech', '0790100015', 'ibrahim@autojordan.jo', 'غسيل وتلميع وبوليش', '2021-08-01'),
(1, 'هبة المصري', 'accountant', '0790100016', 'heba@autojordan.jo', 'محاسبة ومالية', '2019-01-15');

-- فرع إربد
INSERT INTO employees (branch_id, name, role, phone, email, specialization, hire_date) VALUES
(2, 'أحمد النعيمات', 'manager', '0790200001', 'ahmad.n@autojordan.jo', 'إدارة فرع', '2019-06-01'),
(2, 'محمود الشريدة', 'sales', '0790200002', 'mahmoud@autojordan.jo', 'مبيعات سيارات', '2020-02-01'),
(2, 'م. علي البطاينة', 'mechanic', '0790200003', 'ali.b@autojordan.jo', 'ميكانيك عام', '2019-09-01'),
(2, 'م. حسين الخصاونة', 'mechanic', '0790200004', 'husain@autojordan.jo', 'ميكانيك كوري وياباني', '2020-04-01'),
(2, 'خالد العبيدات', 'parts_specialist', '0790200005', 'khalid.o@autojordan.jo', 'قطع غيار', '2020-01-01'),
(2, 'سارة الزعبي', 'receptionist', '0790200006', 'sara@autojordan.jo', 'استقبال', '2021-05-01'),
(2, 'عادل الرفاعي', 'electrician', '0790200007', 'adel@autojordan.jo', 'كهرباء سيارات', '2020-08-01');

-- فرع الزرقاء
INSERT INTO employees (branch_id, name, role, phone, email, specialization, hire_date) VALUES
(3, 'محمد العبادي', 'manager', '0790300001', 'mohammad.a@autojordan.jo', 'إدارة فرع', '2019-04-01'),
(3, 'أنس الحراحشة', 'sales', '0790300002', 'anas@autojordan.jo', 'مبيعات سيارات', '2020-07-01'),
(3, 'م. راتب الخوالدة', 'mechanic', '0790300003', 'rateb@autojordan.jo', 'ميكانيك عام', '2018-11-01'),
(3, 'م. عيسى المحاسنة', 'mechanic', '0790300004', 'issa@autojordan.jo', 'ميكانيك هيونداي', '2020-03-01'),
(3, 'نواف الجراح', 'parts_specialist', '0790300005', 'nawaf@autojordan.jo', 'قطع غيار', '2020-09-01'),
(3, 'مريم الطحان', 'receptionist', '0790300006', 'maryam@autojordan.jo', 'استقبال', '2021-02-01');

-- فرع العقبة
INSERT INTO employees (branch_id, name, role, phone, email, specialization, hire_date) VALUES
(4, 'سامر الخطيب', 'manager', '0790400001', 'samer@autojordan.jo', 'إدارة فرع', '2020-01-15'),
(4, 'معاذ الغزاوي', 'sales', '0790400002', 'muath@autojordan.jo', 'مبيعات سيارات', '2020-10-01'),
(4, 'م. أيمن الحياري', 'mechanic', '0790400003', 'ayman@autojordan.jo', 'ميكانيك عام', '2020-03-01'),
(4, 'يوسف الحجاج', 'parts_specialist', '0790400004', 'yousef@autojordan.jo', 'قطع غيار', '2021-01-01'),
(4, 'لينا البدور', 'receptionist', '0790400005', 'lina@autojordan.jo', 'استقبال', '2021-06-01');

-- =============================================
-- تصنيفات قطع الغيار
-- =============================================
INSERT INTO parts_categories (name, name_en, parent_id, description) VALUES
('محرك', 'Engine', NULL, 'قطع المحرك والأجزاء الداخلية'),
('فرامل', 'Brakes', NULL, 'أنظمة الفرامل والتوقف'),
('تعليق', 'Suspension', NULL, 'نظام التعليق والمساعدات'),
('كهرباء', 'Electrical', NULL, 'الأجزاء الكهربائية والإلكترونية'),
('جسم السيارة', 'Body Parts', NULL, 'قطع الهيكل الخارجي'),
('تكييف', 'AC System', NULL, 'نظام التبريد والتكييف'),
('ناقل الحركة', 'Transmission', NULL, 'علبة السرعات والقير'),
('عادم', 'Exhaust', NULL, 'نظام العادم'),
('إطارات وجنوط', 'Tires & Wheels', NULL, 'الإطارات والجنوط'),
('زيوت وفلاتر', 'Oils & Filters', NULL, 'الزيوت والفلاتر بأنواعها'),
('إضاءة', 'Lighting', NULL, 'الأضواء الأمامية والخلفية'),
('مساحات وزجاج', 'Wipers & Glass', NULL, 'المساحات والزجاج'),
('تبريد المحرك', 'Cooling System', NULL, 'الرديتر والثيرموستات'),
('وقود', 'Fuel System', NULL, 'نظام الوقود والحقن');

-- تصنيفات فرعية
INSERT INTO parts_categories (name, name_en, parent_id, description) VALUES
('فلتر زيت', 'Oil Filter', 10, 'فلاتر الزيت'),
('فلتر هواء', 'Air Filter', 10, 'فلاتر الهواء'),
('فلتر بنزين', 'Fuel Filter', 10, 'فلاتر البنزين'),
('فلتر مكيف', 'Cabin Filter', 10, 'فلاتر المكيف'),
('زيت محرك', 'Engine Oil', 10, 'زيوت المحرك'),
('زيت قير', 'Transmission Oil', 10, 'زيوت ناقل الحركة'),
('بواجي', 'Spark Plugs', 1, 'شمعات الاشتعال'),
('سيور', 'Belts', 1, 'سيور المحرك'),
('بطارية', 'Battery', 4, 'بطاريات السيارة'),
('دينمو', 'Alternator', 4, 'مولد الكهرباء');

-- =============================================
-- قطع الغيار - مخزون كبير لكل فرع
-- =============================================

-- فلاتر زيت - الفرع الرئيسي عمان
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 15, 'OF-TOY-001', 'فلتر زيت تويوتا', 'Toyota Oil Filter', 'Toyota Genuine', '04152-YZZA1', '["Toyota"]', '["Camry","Corolla","RAV4","Yaris"]', '2015-2025', 'new', 'genuine', 45, 5, 8.50, 4.50, 12),
(1, 15, 'OF-TOY-002', 'فلتر زيت تويوتا لاندكروزر', 'Toyota Land Cruiser Oil Filter', 'Toyota Genuine', '04152-38020', '["Toyota"]', '["Land Cruiser","Prado","FJ Cruiser"]', '2010-2024', 'new', 'genuine', 25, 3, 12.00, 6.50, 12),
(1, 15, 'OF-HYN-001', 'فلتر زيت هيونداي/كيا', 'Hyundai/Kia Oil Filter', 'Hyundai Genuine', '26300-35503', '["Hyundai","Kia"]', '["Tucson","Sonata","Sportage","Optima","Elantra"]', '2016-2025', 'new', 'genuine', 55, 5, 7.00, 3.50, 12),
(1, 15, 'OF-HON-001', 'فلتر زيت هوندا', 'Honda Oil Filter', 'Honda Genuine', '15400-RTA-003', '["Honda"]', '["Civic","Accord","CR-V","HR-V"]', '2014-2025', 'new', 'genuine', 30, 3, 7.50, 4.00, 12),
(1, 15, 'OF-NIS-001', 'فلتر زيت نيسان', 'Nissan Oil Filter', 'Nissan Genuine', '15208-65F0E', '["Nissan"]', '["Sunny","Sentra","X-Trail","Pathfinder","Patrol"]', '2013-2025', 'new', 'genuine', 35, 3, 8.00, 4.00, 12),
(1, 15, 'OF-BMW-001', 'فلتر زيت BMW', 'BMW Oil Filter', 'BMW Genuine', '11427566327', '["BMW"]', '["320i","520i","X3","X5"]', '2015-2024', 'new', 'genuine', 15, 2, 22.00, 12.00, 12),
(1, 15, 'OF-MER-001', 'فلتر زيت مرسيدس', 'Mercedes Oil Filter', 'Mercedes Genuine', 'A6511800109', '["Mercedes-Benz"]', '["C200","E200","GLC","GLE"]', '2014-2024', 'new', 'genuine', 12, 2, 25.00, 14.00, 12),
(1, 15, 'OF-CHV-001', 'فلتر زيت شيفروليه', 'Chevrolet Oil Filter', 'ACDelco', 'PF63E', '["Chevrolet","GMC"]', '["Silverado","Tahoe","Suburban","Sierra"]', '2014-2024', 'new', 'oem', 20, 3, 9.00, 4.50, 12),
(1, 15, 'OF-MG-001', 'فلتر زيت MG', 'MG Oil Filter', 'MG Genuine', '10422060', '["MG"]', '["MG5","MG6","MG ZS","MG HS","MG RX5"]', '2019-2025', 'new', 'genuine', 30, 3, 6.50, 3.00, 6),
(1, 15, 'OF-CHR-001', 'فلتر زيت شيري', 'Chery Oil Filter', 'Chery Genuine', 'E4G16-1012040', '["Chery"]', '["Tiggo 4","Tiggo 7","Tiggo 8","Arrizo 5"]', '2018-2025', 'new', 'genuine', 25, 3, 5.50, 2.50, 6);

-- فلاتر هواء
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 16, 'AF-TOY-001', 'فلتر هواء تويوتا كامري', 'Toyota Camry Air Filter', 'Toyota Genuine', '17801-0H050', '["Toyota"]', '["Camry","Aurion"]', '2015-2024', 'new', 'genuine', 30, 3, 12.00, 6.00, 6),
(1, 16, 'AF-HYN-001', 'فلتر هواء هيونداي توسان', 'Hyundai Tucson Air Filter', 'Hyundai Genuine', '28113-D3100', '["Hyundai"]', '["Tucson","Sonata"]', '2016-2025', 'new', 'genuine', 25, 3, 10.00, 5.00, 6),
(1, 16, 'AF-KIA-001', 'فلتر هواء كيا سبورتاج', 'Kia Sportage Air Filter', 'Kia Genuine', '28113-D9100', '["Kia"]', '["Sportage","Sorento"]', '2016-2025', 'new', 'genuine', 20, 3, 11.00, 5.50, 6),
(1, 16, 'AF-NIS-001', 'فلتر هواء نيسان', 'Nissan Air Filter', 'Nissan Genuine', '16546-30P00', '["Nissan"]', '["Sunny","Sentra","Qashqai"]', '2014-2024', 'new', 'genuine', 25, 3, 9.00, 4.50, 6);

-- بواجي (شمعات اشتعال)
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 21, 'SP-NGK-001', 'بواجي NGK إيريديوم', 'NGK Iridium Spark Plug', 'NGK', 'ILKAR7B11', '["Toyota","Honda","Nissan","Mitsubishi"]', '["Camry","Corolla","Civic","Sunny"]', '2012-2025', 'new', 'oem', 100, 10, 5.50, 2.50, 12),
(1, 21, 'SP-NGK-002', 'بواجي NGK بلاتينيوم', 'NGK Platinum Spark Plug', 'NGK', 'BKR6EIX-11', '["Toyota","Nissan","Hyundai","Kia"]', '["Land Cruiser","Patrol","Santa Fe"]', '2010-2024', 'new', 'oem', 60, 5, 7.00, 3.50, 12),
(1, 21, 'SP-BOS-001', 'بواجي بوش', 'Bosch Spark Plug', 'Bosch', 'FR7LDC+', '["BMW","Mercedes-Benz","Volkswagen","Audi"]', '["320i","C200","Golf","A4"]', '2012-2024', 'new', 'oem', 40, 5, 8.50, 4.00, 12);

-- فرامل
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 2, 'BP-TOY-F01', 'بطانة فرامل أمامية تويوتا كامري', 'Toyota Camry Front Brake Pads', 'Toyota Genuine', '04465-33471', '["Toyota"]', '["Camry","Avalon"]', '2012-2024', 'new', 'genuine', 20, 3, 35.00, 18.00, 12),
(1, 2, 'BP-TOY-R01', 'بطانة فرامل خلفية تويوتا كامري', 'Toyota Camry Rear Brake Pads', 'Toyota Genuine', '04466-33180', '["Toyota"]', '["Camry","Avalon"]', '2012-2024', 'new', 'genuine', 18, 3, 30.00, 15.00, 12),
(1, 2, 'BP-HYN-F01', 'بطانة فرامل أمامية هيونداي توسان', 'Hyundai Tucson Front Brake Pads', 'Hyundai Genuine', '58101-D3A11', '["Hyundai"]', '["Tucson","Santa Fe"]', '2016-2025', 'new', 'genuine', 22, 3, 32.00, 16.00, 12),
(1, 2, 'BP-KIA-F01', 'بطانة فرامل أمامية كيا سبورتاج', 'Kia Sportage Front Brake Pads', 'Kia Genuine', '58101-D3A00', '["Kia"]', '["Sportage","Sorento"]', '2016-2025', 'new', 'genuine', 18, 3, 33.00, 16.50, 12),
(1, 2, 'BD-TOY-F01', 'ديسك فرامل أمامي تويوتا كامري', 'Toyota Camry Front Brake Disc', 'Toyota Genuine', '43512-33130', '["Toyota"]', '["Camry"]', '2012-2024', 'new', 'genuine', 10, 2, 55.00, 28.00, 12),
(1, 2, 'BD-GEN-001', 'ديسك فرامل عام - بريمبو', 'Brembo Universal Brake Disc', 'Brembo', 'BR-09A820', '["Toyota","Honda","Nissan","Hyundai"]', '["Camry","Civic","Sunny","Elantra"]', '2012-2024', 'new', 'aftermarket', 15, 2, 42.00, 22.00, 6);

-- تعليق ومساعدات
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 3, 'SH-TOY-F01', 'مساعد أمامي تويوتا كامري', 'Toyota Camry Front Shock', 'KYB', '339232', '["Toyota"]', '["Camry"]', '2012-2017', 'new', 'oem', 8, 2, 65.00, 35.00, 12),
(1, 3, 'SH-TOY-F02', 'مساعد أمامي تويوتا كورولا', 'Toyota Corolla Front Shock', 'KYB', '339307', '["Toyota"]', '["Corolla"]', '2014-2019', 'new', 'oem', 10, 2, 55.00, 28.00, 12),
(1, 3, 'SH-HYN-F01', 'مساعد أمامي هيونداي توسان', 'Hyundai Tucson Front Shock', 'Mando', '54651-D7050', '["Hyundai"]', '["Tucson"]', '2016-2024', 'new', 'genuine', 6, 2, 85.00, 45.00, 12),
(1, 3, 'TRE-GEN-001', 'طرف مقصات عام', 'Tie Rod End Universal', 'CTR', 'CET-173', '["Toyota","Honda"]', '["Camry","Civic","Accord"]', '2012-2024', 'new', 'oem', 20, 3, 18.00, 9.00, 6),
(1, 3, 'BA-GEN-001', 'جلدة مقصات عام', 'Control Arm Bushing', 'CTR', 'CB-0723', '["Hyundai","Kia"]', '["Tucson","Sportage"]', '2016-2024', 'new', 'oem', 15, 3, 12.00, 6.00, 6);

-- بطاريات
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 23, 'BAT-VRT-60', 'بطارية فارتا 60 أمبير', 'Varta Battery 60Ah', 'Varta', 'D24', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["Camry","Corolla","Civic","Sunny","Elantra","Sportage"]', '2010-2025', 'new', 'oem', 25, 3, 75.00, 45.00, 24),
(1, 23, 'BAT-VRT-80', 'بطارية فارتا 80 أمبير', 'Varta Battery 80Ah', 'Varta', 'F17', '["Toyota","BMW","Mercedes-Benz"]', '["Land Cruiser","Prado","X5","GLE"]', '2010-2025', 'new', 'oem', 15, 2, 95.00, 58.00, 24),
(1, 23, 'BAT-VRT-100', 'بطارية فارتا 100 أمبير', 'Varta Battery 100Ah', 'Varta', 'H3', '["Toyota","Nissan","Chevrolet"]', '["Land Cruiser","Patrol","Tahoe","Silverado"]', '2010-2025', 'new', 'oem', 10, 2, 120.00, 72.00, 24),
(1, 23, 'BAT-BOS-60', 'بطارية بوش 60 أمبير', 'Bosch Battery 60Ah', 'Bosch', 'S4 005', '["Toyota","Hyundai","Kia","MG","Chery"]', '["Corolla","Elantra","Sportage","MG5","Tiggo"]', '2010-2025', 'new', 'oem', 20, 3, 70.00, 42.00, 18);

-- زيوت
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 19, 'OIL-MOB-5W30', 'زيت موبيل 1 5W-30 (4 لتر)', 'Mobil 1 5W-30 4L', 'Mobil 1', 'MOB-5W30-4L', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["All Models"]', '2010-2025', 'new', 'oem', 50, 10, 38.00, 22.00, 0),
(1, 19, 'OIL-MOB-5W40', 'زيت موبيل 1 5W-40 (4 لتر)', 'Mobil 1 5W-40 4L', 'Mobil 1', 'MOB-5W40-4L', '["BMW","Mercedes-Benz","Volkswagen","Audi"]', '["All Models"]', '2010-2025', 'new', 'oem', 30, 5, 42.00, 25.00, 0),
(1, 19, 'OIL-CAS-5W30', 'زيت كاسترول إيدج 5W-30 (4 لتر)', 'Castrol Edge 5W-30 4L', 'Castrol', 'CAS-EDGE-5W30', '["Toyota","Honda","Hyundai","Kia","MG"]', '["All Models"]', '2010-2025', 'new', 'oem', 40, 8, 35.00, 20.00, 0),
(1, 19, 'OIL-TOY-0W20', 'زيت تويوتا أصلي 0W-20 (4 لتر)', 'Toyota Genuine 0W-20 4L', 'Toyota', 'TOY-0W20-4L', '["Toyota"]', '["Camry","Corolla","RAV4","CHR"]', '2018-2025', 'new', 'genuine', 25, 5, 45.00, 28.00, 0),
(1, 20, 'OIL-ATF-001', 'زيت قير أوتوماتيك ATF (1 لتر)', 'ATF Transmission Fluid 1L', 'Aisin', 'ATF-WS', '["Toyota","Lexus"]', '["All Auto Models"]', '2010-2025', 'new', 'oem', 30, 5, 15.00, 8.00, 0);

-- إطارات
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 9, 'TIR-BRI-205', 'إطار بريجستون 205/55R16', 'Bridgestone Turanza 205/55R16', 'Bridgestone', 'T005-205', '["Toyota","Honda","Hyundai","Kia"]', '["Camry","Civic","Sonata","Optima"]', '2015-2025', 'new', 'oem', 40, 8, 65.00, 40.00, 36),
(1, 9, 'TIR-BRI-215', 'إطار بريجستون 215/60R17', 'Bridgestone Dueler 215/60R17', 'Bridgestone', 'D684-215', '["Hyundai","Kia","Toyota"]', '["Tucson","Sportage","RAV4"]', '2016-2025', 'new', 'oem', 30, 6, 78.00, 48.00, 36),
(1, 9, 'TIR-MIC-225', 'إطار ميشلان 225/65R17', 'Michelin Primacy 225/65R17', 'Michelin', 'PRI4-225', '["Toyota","Nissan","Honda"]', '["Fortuner","X-Trail","CR-V"]', '2015-2025', 'new', 'oem', 20, 4, 88.00, 55.00, 48),
(1, 9, 'TIR-BFG-265', 'إطار BF Goodrich 265/70R17', 'BF Goodrich AT 265/70R17', 'BF Goodrich', 'AT-KO2-265', '["Toyota","Nissan"]', '["Land Cruiser","Prado","Patrol","Hilux"]', '2010-2025', 'new', 'oem', 16, 4, 110.00, 70.00, 48),
(1, 9, 'TIR-DUN-195', 'إطار دنلوب 195/65R15', 'Dunlop SP Sport 195/65R15', 'Dunlop', 'SP-195', '["Toyota","Nissan","Hyundai","MG","Chery"]', '["Corolla","Sunny","Elantra","MG5","Arrizo"]', '2014-2025', 'new', 'oem', 50, 10, 45.00, 28.00, 24);

-- تكييف
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 6, 'AC-COMP-001', 'كمبروسر مكيف تويوتا كامري', 'Toyota Camry AC Compressor', 'Denso', '88310-06330', '["Toyota"]', '["Camry"]', '2012-2017', 'new', 'oem', 4, 1, 280.00, 160.00, 12),
(1, 6, 'AC-COMP-002', 'كمبروسر مكيف هيونداي توسان', 'Hyundai Tucson AC Compressor', 'Doowon', '97701-D3500', '["Hyundai"]', '["Tucson"]', '2016-2024', 'new', 'genuine', 3, 1, 310.00, 180.00, 12),
(1, 18, 'AC-FILT-GEN', 'فلتر مكيف عام', 'Cabin Air Filter Universal', 'Denso', 'DCC-2044', '["Toyota","Honda","Nissan"]', '["Camry","Civic","Sunny"]', '2014-2024', 'new', 'oem', 40, 5, 8.00, 3.50, 6),
(1, 6, 'AC-GAS-134', 'غاز فريون R134a (1 كيلو)', 'R134a Refrigerant 1kg', 'Honeywell', 'R134A-1KG', '["All"]', '["All Models"]', '2000-2025', 'new', 'oem', 30, 5, 18.00, 10.00, 0);

-- إضاءة
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 11, 'HL-TOY-CAM', 'شمعة أمامية يمين تويوتا كامري', 'Toyota Camry Right Headlight', 'Koito', '81110-06C10', '["Toyota"]', '["Camry"]', '2018-2024', 'new', 'genuine', 4, 1, 320.00, 180.00, 12),
(1, 11, 'BLB-PHI-H7', 'لمبة فيليبس H7 LED', 'Philips H7 LED Bulb', 'Philips', 'UEX2-H7', '["All"]', '["All Models"]', '2010-2025', 'new', 'oem', 30, 5, 45.00, 25.00, 12),
(1, 11, 'BLB-PHI-H4', 'لمبة فيليبس H4 LED', 'Philips H4 LED Bulb', 'Philips', 'UEX2-H4', '["All"]', '["All Models"]', '2010-2025', 'new', 'oem', 35, 5, 42.00, 23.00, 12),
(1, 11, 'BLB-OSR-H11', 'لمبة أوسرام H11 هالوجين', 'Osram H11 Halogen', 'Osram', 'N64211', '["All"]', '["All Models"]', '2010-2025', 'new', 'oem', 25, 5, 12.00, 6.00, 6);

-- سيور
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 22, 'BLT-GTS-001', 'سير مكيف تويوتا كامري', 'Toyota Camry AC Belt', 'Gates', '6PK1230', '["Toyota"]', '["Camry","Corolla"]', '2012-2024', 'new', 'oem', 15, 3, 18.00, 9.00, 12),
(1, 22, 'BLT-GTS-002', 'سير تايمنق تويوتا', 'Toyota Timing Belt Kit', 'Gates', 'TCK329', '["Toyota"]', '["Camry 2.4","RAV4 2.4"]', '2006-2017', 'new', 'oem', 8, 2, 85.00, 48.00, 24),
(1, 22, 'BLT-CTN-001', 'سير دينمو هيونداي', 'Hyundai Alternator Belt', 'Continental', '6PK2140', '["Hyundai","Kia"]', '["Tucson","Sportage"]', '2016-2024', 'new', 'oem', 12, 2, 22.00, 11.00, 12);

-- تبريد محرك
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(1, 13, 'RAD-TOY-001', 'رديتر تويوتا كامري', 'Toyota Camry Radiator', 'Denso', '16400-0H291', '["Toyota"]', '["Camry"]', '2012-2017', 'new', 'oem', 5, 1, 145.00, 80.00, 12),
(1, 13, 'THR-GEN-001', 'ثيرموستات عام 82 درجة', 'Thermostat 82°C Universal', 'Gates', 'TH-33682', '["Toyota","Honda","Nissan"]', '["Camry","Civic","Sunny"]', '2010-2024', 'new', 'oem', 15, 3, 12.00, 6.00, 12),
(1, 13, 'WP-TOY-001', 'طرمبة ماء تويوتا كامري', 'Toyota Camry Water Pump', 'GMB', 'GWT-127A', '["Toyota"]', '["Camry 2.5","RAV4 2.5"]', '2012-2024', 'new', 'oem', 6, 2, 55.00, 30.00, 12),
(1, 13, 'COL-GEN-001', 'ماء رديتر أخضر (4 لتر)', 'Green Coolant 4L', 'Prestone', 'AF2100', '["All"]', '["All Models"]', '2000-2025', 'new', 'oem', 35, 5, 12.00, 6.00, 0);

-- قطع الغيار لباقي الأفرع (عينة)
-- فرع إربد
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(2, 15, 'OF-TOY-001', 'فلتر زيت تويوتا', 'Toyota Oil Filter', 'Toyota Genuine', '04152-YZZA1', '["Toyota"]', '["Camry","Corolla","RAV4","Yaris"]', '2015-2025', 'new', 'genuine', 30, 3, 8.50, 4.50, 12),
(2, 15, 'OF-HYN-001', 'فلتر زيت هيونداي/كيا', 'Hyundai/Kia Oil Filter', 'Hyundai Genuine', '26300-35503', '["Hyundai","Kia"]', '["Tucson","Sonata","Sportage","Optima","Elantra"]', '2016-2025', 'new', 'genuine', 35, 3, 7.00, 3.50, 12),
(2, 19, 'OIL-MOB-5W30', 'زيت موبيل 1 5W-30 (4 لتر)', 'Mobil 1 5W-30 4L', 'Mobil 1', 'MOB-5W30-4L', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["All Models"]', '2010-2025', 'new', 'oem', 30, 5, 38.00, 22.00, 0),
(2, 23, 'BAT-VRT-60', 'بطارية فارتا 60 أمبير', 'Varta Battery 60Ah', 'Varta', 'D24', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["Camry","Corolla","Civic","Sunny","Elantra","Sportage"]', '2010-2025', 'new', 'oem', 15, 2, 75.00, 45.00, 24),
(2, 2, 'BP-TOY-F01', 'بطانة فرامل أمامية تويوتا كامري', 'Toyota Camry Front Brake Pads', 'Toyota Genuine', '04465-33471', '["Toyota"]', '["Camry","Avalon"]', '2012-2024', 'new', 'genuine', 12, 2, 35.00, 18.00, 12),
(2, 9, 'TIR-DUN-195', 'إطار دنلوب 195/65R15', 'Dunlop SP Sport 195/65R15', 'Dunlop', 'SP-195', '["Toyota","Nissan","Hyundai","MG","Chery"]', '["Corolla","Sunny","Elantra","MG5","Arrizo"]', '2014-2025', 'new', 'oem', 30, 6, 45.00, 28.00, 24);

-- فرع الزرقاء
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(3, 15, 'OF-TOY-001', 'فلتر زيت تويوتا', 'Toyota Oil Filter', 'Toyota Genuine', '04152-YZZA1', '["Toyota"]', '["Camry","Corolla","RAV4","Yaris"]', '2015-2025', 'new', 'genuine', 25, 3, 8.50, 4.50, 12),
(3, 15, 'OF-HYN-001', 'فلتر زيت هيونداي/كيا', 'Hyundai/Kia Oil Filter', 'Hyundai Genuine', '26300-35503', '["Hyundai","Kia"]', '["Tucson","Sonata","Sportage","Optima","Elantra"]', '2016-2025', 'new', 'genuine', 30, 3, 7.00, 3.50, 12),
(3, 19, 'OIL-CAS-5W30', 'زيت كاسترول إيدج 5W-30 (4 لتر)', 'Castrol Edge 5W-30 4L', 'Castrol', 'CAS-EDGE-5W30', '["Toyota","Honda","Hyundai","Kia","MG"]', '["All Models"]', '2010-2025', 'new', 'oem', 25, 5, 35.00, 20.00, 0),
(3, 23, 'BAT-BOS-60', 'بطارية بوش 60 أمبير', 'Bosch Battery 60Ah', 'Bosch', 'S4 005', '["Toyota","Hyundai","Kia","MG","Chery"]', '["Corolla","Elantra","Sportage","MG5","Tiggo"]', '2010-2025', 'new', 'oem', 12, 2, 70.00, 42.00, 18),
(3, 9, 'TIR-BRI-205', 'إطار بريجستون 205/55R16', 'Bridgestone Turanza 205/55R16', 'Bridgestone', 'T005-205', '["Toyota","Honda","Hyundai","Kia"]', '["Camry","Civic","Sonata","Optima"]', '2015-2025', 'new', 'oem', 24, 4, 65.00, 40.00, 36);

-- فرع العقبة
INSERT INTO parts_inventory (branch_id, category_id, part_number, name, name_en, brand, oem_number, compatible_makes, compatible_models, compatible_years, condition, quality, quantity, min_stock_level, price, cost_price, warranty_months) VALUES
(4, 15, 'OF-TOY-001', 'فلتر زيت تويوتا', 'Toyota Oil Filter', 'Toyota Genuine', '04152-YZZA1', '["Toyota"]', '["Camry","Corolla","RAV4","Yaris"]', '2015-2025', 'new', 'genuine', 20, 3, 8.50, 4.50, 12),
(4, 15, 'OF-HYN-001', 'فلتر زيت هيونداي/كيا', 'Hyundai/Kia Oil Filter', 'Hyundai Genuine', '26300-35503', '["Hyundai","Kia"]', '["Tucson","Sonata","Sportage","Optima","Elantra"]', '2016-2025', 'new', 'genuine', 20, 3, 7.00, 3.50, 12),
(4, 19, 'OIL-MOB-5W30', 'زيت موبيل 1 5W-30 (4 لتر)', 'Mobil 1 5W-30 4L', 'Mobil 1', 'MOB-5W30-4L', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["All Models"]', '2010-2025', 'new', 'oem', 20, 3, 38.00, 22.00, 0),
(4, 23, 'BAT-VRT-60', 'بطارية فارتا 60 أمبير', 'Varta Battery 60Ah', 'Varta', 'D24', '["Toyota","Honda","Nissan","Hyundai","Kia"]', '["Camry","Corolla","Civic","Sunny","Elantra","Sportage"]', '2010-2025', 'new', 'oem', 10, 2, 75.00, 45.00, 24);

-- =============================================
-- خدمات الصيانة المتوفرة
-- =============================================
INSERT INTO service_types (name, name_en, category, description, estimated_duration_minutes, base_price, requires_appointment, requires_parts) VALUES
-- صيانة دورية
('تغيير زيت وفلتر', 'Oil & Filter Change', 'routine', 'تغيير زيت المحرك وفلتر الزيت', 30, 25.00, 0, 1),
('صيانة 10,000 كم', '10K Service', 'routine', 'فحص شامل + تغيير زيت وفلتر + فحص فرامل + فحص إطارات', 60, 45.00, 1, 1),
('صيانة 20,000 كم', '20K Service', 'routine', 'صيانة 10K + تغيير فلتر هواء + فلتر مكيف + فحص سيور', 90, 75.00, 1, 1),
('صيانة 40,000 كم', '40K Service', 'routine', 'صيانة 20K + تغيير بواجي + فحص شامل للمحرك', 120, 120.00, 1, 1),
('صيانة 60,000 كم', '60K Major Service', 'routine', 'صيانة شاملة + تغيير زيت قير + فحص تعليق كامل', 180, 180.00, 1, 1),
('صيانة 100,000 كم', '100K Major Service', 'routine', 'صيانة كبرى شاملة + تغيير سير تايمنق + طرمبة ماء', 300, 350.00, 1, 1),

-- فرامل
('تغيير بطانات فرامل أمامية', 'Front Brake Pads Replacement', 'repair', 'تغيير بطانات الفرامل الأمامية مع فحص الديسكات', 60, 20.00, 1, 1),
('تغيير بطانات فرامل خلفية', 'Rear Brake Pads Replacement', 'repair', 'تغيير بطانات الفرامل الخلفية', 60, 20.00, 1, 1),
('خراطة ديسكات فرامل', 'Brake Disc Resurface', 'repair', 'خراطة وتسوية ديسكات الفرامل', 45, 15.00, 1, 0),
('تغيير ديسكات فرامل', 'Brake Disc Replacement', 'repair', 'تغيير ديسكات الفرامل', 60, 25.00, 1, 1),

-- تعليق
('فحص تعليق شامل', 'Full Suspension Check', 'repair', 'فحص شامل لنظام التعليق والتوجيه', 45, 15.00, 1, 0),
('تغيير مساعدات أمامية', 'Front Shocks Replacement', 'repair', 'تغيير المساعدات الأمامية (الزوج)', 90, 40.00, 1, 1),
('تغيير مساعدات خلفية', 'Rear Shocks Replacement', 'repair', 'تغيير المساعدات الخلفية (الزوج)', 75, 35.00, 1, 1),
('ترصيص وموازنة', 'Wheel Alignment & Balance', 'tire', 'ترصيص وموازنة الإطارات الأربعة', 45, 20.00, 0, 0),
('تبديل إطارات', 'Tire Rotation', 'tire', 'تبديل أماكن الإطارات', 30, 10.00, 0, 0),

-- كهرباء
('فحص كمبيوتر (تشخيص)', 'Computer Diagnostic', 'diagnostic', 'فحص كمبيوتر السيارة وقراءة الأعطال', 30, 15.00, 0, 0),
('تغيير بطارية', 'Battery Replacement', 'electrical', 'تغيير بطارية السيارة مع فحص الشحن', 20, 10.00, 0, 1),
('تغيير دينمو', 'Alternator Replacement', 'electrical', 'تغيير مولد الكهرباء (الدينمو)', 90, 35.00, 1, 1),
('تغيير سلف (مارش)', 'Starter Motor Replacement', 'electrical', 'تغيير محرك التشغيل (السلف)', 75, 30.00, 1, 1),
('برمجة مفتاح', 'Key Programming', 'electrical', 'برمجة مفتاح أو ريموت السيارة', 30, 25.00, 1, 0),

-- تكييف
('شحن فريون مكيف', 'AC Recharge', 'ac', 'شحن غاز فريون + فحص تسريب', 45, 25.00, 0, 1),
('تنظيف مكيف', 'AC System Clean', 'ac', 'تنظيف وتعقيم نظام التكييف', 30, 15.00, 0, 0),
('تغيير كمبروسر مكيف', 'AC Compressor Replacement', 'ac', 'تغيير ضاغط المكيف مع الشحن', 180, 60.00, 1, 1),

-- سمكرة ودهان
('إصلاح خدش بسيط', 'Minor Scratch Repair', 'body', 'إصلاح خدش سطحي بالدهان', 120, 35.00, 1, 0),
('دهان قطعة كاملة', 'Full Panel Repaint', 'body', 'إعادة دهان قطعة كاملة (باب/صدام/رفرف)', 480, 120.00, 1, 0),
('إصلاح صدام', 'Bumper Repair', 'body', 'إصلاح وترميم صدام أمامي أو خلفي', 180, 80.00, 1, 0),
('تلميع وبوليش كامل', 'Full Detail & Polish', 'body', 'تلميع وبوليش السيارة كاملة مع حماية', 240, 60.00, 1, 0),
('حماية سيراميك', 'Ceramic Coating', 'body', 'طبقة حماية سيراميك للسيارة كاملة', 480, 250.00, 1, 0),

-- غسيل
('غسيل خارجي', 'Exterior Wash', 'wash', 'غسيل خارجي بالشامبو مع تجفيف', 20, 5.00, 0, 0),
('غسيل داخلي وخارجي', 'Full Wash', 'wash', 'غسيل شامل داخلي وخارجي', 40, 10.00, 0, 0),
('غسيل VIP', 'VIP Detailing', 'wash', 'غسيل شامل + تلميع + تنظيف محرك + معطر', 90, 25.00, 0, 0),

-- أخرى
('فحص ما قبل الشراء', 'Pre-Purchase Inspection', 'diagnostic', 'فحص شامل لسيارة قبل الشراء - 150 نقطة', 90, 35.00, 1, 0),
('تغيير زيت قير أوتوماتيك', 'Auto Transmission Fluid Change', 'repair', 'تغيير زيت ناقل الحركة الأوتوماتيكي', 60, 30.00, 1, 1),
('تنظيف بخاخات (إنجكتر)', 'Injector Cleaning', 'repair', 'تنظيف رشاشات الوقود بالألتراسونيك', 90, 40.00, 1, 0);

-- =============================================
-- معرض السيارات - سيارات للبيع
-- =============================================
-- فرع عمان - سيارات جديدة
INSERT INTO car_inventory (branch_id, make, model, year, trim_level, color_exterior, color_interior, engine_type, engine_size, transmission, drivetrain, mileage, condition, price, original_price, monthly_installment, installment_months, features, body_type, seats, fuel_consumption, origin_country, warranty_months, warranty_km, is_featured, status) VALUES
(1, 'Toyota', 'Camry', 2025, 'GLE', 'أبيض لؤلؤي', 'بيج', 'petrol', '2.5L', 'automatic', 'fwd', 0, 'new', 32000, 33500, 533, 60, '["شاشة 9 انش","كاميرا خلفية","حساسات ركن","مثبت سرعة","بلوتوث","Apple CarPlay","مقاعد جلد","فتحة سقف","إضاءة LED"]', 'sedan', 5, '7.8L/100km', 'اليابان', 60, 100000, 1, 'available'),
(1, 'Toyota', 'Camry', 2025, 'SE', 'فضي', 'أسود', 'petrol', '2.5L', 'automatic', 'fwd', 0, 'new', 29500, 30500, 491, 60, '["شاشة 7 انش","كاميرا خلفية","بلوتوث","مثبت سرعة","Apple CarPlay"]', 'sedan', 5, '7.8L/100km', 'اليابان', 60, 100000, 0, 'available'),
(1, 'Toyota', 'Corolla', 2025, 'XLi', 'أبيض', 'رمادي', 'petrol', '1.6L', 'automatic', 'fwd', 0, 'new', 22500, 23000, 375, 60, '["شاشة 7 انش","كاميرا خلفية","بلوتوث","ABS","وسائد هوائية"]', 'sedan', 5, '6.5L/100km', 'اليابان', 36, 100000, 0, 'available'),
(1, 'Toyota', 'Corolla', 2025, 'GLi', 'أسود', 'أسود', 'petrol', '1.8L', 'automatic', 'fwd', 0, 'new', 25500, 26000, 425, 60, '["شاشة 8 انش","كاميرا خلفية","حساسات","بلوتوث","مقاعد جلد","مثبت سرعة"]', 'sedan', 5, '7.0L/100km', 'اليابان', 36, 100000, 0, 'available'),
(1, 'Toyota', 'RAV4', 2025, 'XLE', 'رمادي غامق', 'أسود', 'petrol', '2.5L', 'automatic', 'awd', 0, 'new', 38000, 39500, 633, 60, '["شاشة 8 انش","كاميرا 360","حساسات ركن","مثبت سرعة تكيفي","مقاعد جلد","فتحة سقف","نظام دفع رباعي"]', 'suv', 5, '8.5L/100km', 'اليابان', 60, 100000, 1, 'available'),
(1, 'Toyota', 'Land Cruiser', 2024, 'GXR', 'أبيض لؤلؤي', 'بيج', 'petrol', '3.5L V6 Twin Turbo', 'automatic', '4wd', 0, 'new', 85000, 88000, 1416, 60, '["شاشة 12.3 انش","كاميرا 360","رادار","نظام KDSS","مقاعد جلد","تحكم مناخي 4 مناطق","فتحة سقف بانورامية"]', 'suv', 7, '12.0L/100km', 'اليابان', 60, 200000, 1, 'available'),
(1, 'Toyota', 'Hilux', 2025, 'TRD', 'أسود', 'أسود/أحمر', 'diesel', '2.8L', 'automatic', '4wd', 0, 'new', 48000, 50000, 800, 60, '["شاشة 8 انش","كاميرا خلفية","حساسات","نظام TRD","قفل دفرنس خلفي","حماية سفلية"]', 'pickup', 5, '9.0L/100km', 'تايلاند', 60, 150000, 0, 'available'),
(1, 'Toyota', 'Fortuner', 2025, 'GXR', 'أبيض', 'بيج', 'diesel', '2.8L', 'automatic', '4wd', 0, 'new', 52000, 54000, 866, 60, '["شاشة 8 انش","كاميرا خلفية","7 مقاعد","نظام دفع رباعي","مثبت سرعة","مقاعد جلد"]', 'suv', 7, '9.5L/100km', 'تايلاند', 60, 150000, 0, 'available'),

-- هيونداي
(1, 'Hyundai', 'Tucson', 2025, 'Smart', 'أزرق', 'أسود', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 0, 'new', 30000, 31500, 500, 60, '["شاشة 10.25 انش","كاميرا خلفية","حساسات","بلوتوث","Apple CarPlay","Android Auto","مقاعد جلد"]', 'suv', 5, '8.0L/100km', 'كوريا', 60, 100000, 1, 'available'),
(1, 'Hyundai', 'Elantra', 2025, 'Smart', 'أحمر', 'أسود', 'petrol', '1.6L', 'automatic', 'fwd', 0, 'new', 22000, 23000, 366, 60, '["شاشة 8 انش","كاميرا خلفية","بلوتوث","Apple CarPlay"]', 'sedan', 5, '6.8L/100km', 'كوريا', 60, 100000, 0, 'available'),
(1, 'Hyundai', 'Sonata', 2025, 'Premium', 'أبيض', 'بيج', 'petrol', '2.5L', 'automatic', 'fwd', 0, 'new', 28500, 30000, 475, 60, '["شاشة 12.3 انش","كاميرا 360","مقاعد جلد","فتحة بانورامية","شحن لاسلكي","مثبت سرعة تكيفي"]', 'sedan', 5, '8.2L/100km', 'كوريا', 60, 100000, 1, 'available'),
(1, 'Hyundai', 'Santa Fe', 2025, 'Premium', 'أسود', 'بني', 'petrol', '2.5L Turbo', 'automatic', 'awd', 0, 'new', 45000, 47000, 750, 60, '["شاشة مزدوجة 12.3 انش","كاميرا 360","7 مقاعد","مقاعد جلد","فتحة بانورامية","نظام دفع رباعي"]', 'suv', 7, '10.0L/100km', 'كوريا', 60, 100000, 0, 'available'),

-- كيا
(1, 'Kia', 'Sportage', 2025, 'GT-Line', 'أخضر زيتي', 'أسود', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 0, 'new', 31000, 32500, 516, 60, '["شاشة منحنية","كاميرا 360","حساسات","مقاعد جلد","فتحة سقف","مثبت سرعة تكيفي","LED"]', 'suv', 5, '8.3L/100km', 'كوريا', 60, 100000, 1, 'available'),
(1, 'Kia', 'K5', 2025, 'GT-Line', 'رمادي', 'أسود/أحمر', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 0, 'new', 27000, 28500, 450, 60, '["شاشة 12.3 انش","كاميرا خلفية","مقاعد رياضية","فتحة سقف","شحن لاسلكي"]', 'sedan', 5, '7.5L/100km', 'كوريا', 60, 100000, 0, 'available'),

-- MG (صيني)
(1, 'MG', 'MG5', 2025, 'COM', 'أبيض', 'أسود', 'petrol', '1.5L', 'automatic', 'fwd', 0, 'new', 15500, 16000, 258, 60, '["شاشة 8 انش","كاميرا خلفية","بلوتوث","ABS","4 وسائد هوائية"]', 'sedan', 5, '6.5L/100km', 'الصين', 60, 150000, 0, 'available'),
(1, 'MG', 'MG ZS', 2025, 'LUX', 'أزرق', 'أسود', 'petrol', '1.5L', 'automatic', 'fwd', 0, 'new', 18500, 19500, 308, 60, '["شاشة 10.1 انش","كاميرا 360","حساسات","مقاعد جلد","فتحة سقف"]', 'suv', 5, '7.5L/100km', 'الصين', 60, 150000, 0, 'available'),
(1, 'MG', 'MG HS', 2025, 'Trophy', 'أحمر', 'أسود', 'petrol', '1.5L Turbo', 'automatic', 'fwd', 0, 'new', 24000, 25500, 400, 60, '["شاشة 12.3 انش","كاميرا 360","مقاعد جلد كهربائية","فتحة بانورامية","نظام صوتي Bose"]', 'suv', 5, '8.0L/100km', 'الصين', 60, 150000, 0, 'available'),

-- شيري (صيني)
(1, 'Chery', 'Tiggo 4 Pro', 2025, 'Luxury', 'فضي', 'أسود', 'petrol', '1.5L Turbo', 'automatic', 'fwd', 0, 'new', 19000, 20000, 316, 60, '["شاشة 10.25 انش","كاميرا 360","مقاعد جلد","فتحة سقف","Apple CarPlay"]', 'suv', 5, '7.5L/100km', 'الصين', 60, 150000, 0, 'available'),
(1, 'Chery', 'Tiggo 7 Pro', 2025, 'Premium', 'أبيض', 'بني', 'petrol', '1.5L Turbo', 'automatic', 'fwd', 0, 'new', 23000, 24500, 383, 60, '["شاشة 12.3 انش","كاميرا 360","مقاعد جلد كهربائية","فتحة بانورامية","شحن لاسلكي"]', 'suv', 5, '8.0L/100km', 'الصين', 60, 150000, 0, 'available'),
(1, 'Chery', 'Tiggo 8 Pro', 2025, 'Flagship', 'أسود', 'بيج', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 0, 'new', 28000, 30000, 466, 60, '["شاشة مزدوجة 12.3 انش","كاميرا 360","7 مقاعد","مقاعد جلد نابا","فتحة بانورامية","نظام صوتي Sony"]', 'suv', 7, '9.0L/100km', 'الصين', 60, 150000, 1, 'available');

-- فرع عمان - سيارات مستعملة
INSERT INTO car_inventory (branch_id, make, model, year, trim_level, color_exterior, color_interior, engine_type, engine_size, transmission, drivetrain, mileage, condition, price, monthly_installment, installment_months, features, body_type, seats, origin_country, warranty_months, warranty_km, status) VALUES
(1, 'Toyota', 'Camry', 2020, 'GLE', 'فضي', 'بيج', 'petrol', '2.5L', 'automatic', 'fwd', 65000, 'used', 22000, 366, 60, '["شاشة","كاميرا خلفية","مقاعد جلد","فتحة سقف"]', 'sedan', 5, 'اليابان', 12, 20000, 'available'),
(1, 'Toyota', 'Corolla', 2021, 'GLi', 'أبيض', 'أسود', 'petrol', '1.8L', 'automatic', 'fwd', 48000, 'used', 18500, 308, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'اليابان', 12, 20000, 'available'),
(1, 'Hyundai', 'Tucson', 2021, 'Smart', 'أبيض', 'أسود', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 55000, 'used', 21000, 350, 60, '["شاشة","كاميرا خلفية","حساسات","مقاعد جلد"]', 'suv', 5, 'كوريا', 12, 20000, 'available'),
(1, 'Kia', 'Sportage', 2022, 'LX', 'أسود', 'أسود', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 35000, 'used', 24000, 400, 60, '["شاشة","كاميرا خلفية","حساسات"]', 'suv', 5, 'كوريا', 12, 20000, 'available'),
(1, 'Honda', 'Civic', 2020, 'EX', 'رمادي', 'أسود', 'petrol', '1.5L Turbo', 'automatic', 'fwd', 58000, 'used', 19500, 325, 60, '["شاشة","كاميرا خلفية","مقاعد جلد","فتحة سقف"]', 'sedan', 5, 'اليابان', 6, 10000, 'available'),
(1, 'Nissan', 'X-Trail', 2019, 'SV', 'أبيض', 'بيج', 'petrol', '2.5L', 'automatic', 'awd', 78000, 'used', 18000, 300, 60, '["شاشة","كاميرا 360","7 مقاعد","دفع رباعي"]', 'suv', 7, 'اليابان', 6, 10000, 'available'),
(1, 'BMW', '320i', 2019, 'Sport Line', 'أسود', 'أسود', 'petrol', '2.0L Turbo', 'automatic', 'rwd', 72000, 'used', 28000, 466, 60, '["شاشة iDrive","كاميرا خلفية","مقاعد جلد","فتحة سقف","نظام ملاحة"]', 'sedan', 5, 'ألمانيا', 6, 10000, 'available'),
(1, 'Mercedes-Benz', 'C200', 2020, 'AMG Line', 'أبيض', 'أسود', 'petrol', '1.5L Turbo + EQ Boost', 'automatic', 'rwd', 55000, 'used', 35000, 583, 60, '["شاشة MBUX","كاميرا 360","مقاعد جلد AMG","إضاءة محيطية","فتحة سقف"]', 'sedan', 5, 'ألمانيا', 6, 10000, 'available');

-- فرع إربد
INSERT INTO car_inventory (branch_id, make, model, year, trim_level, color_exterior, color_interior, engine_type, engine_size, transmission, drivetrain, mileage, condition, price, monthly_installment, installment_months, features, body_type, seats, origin_country, warranty_months, warranty_km, status) VALUES
(2, 'Toyota', 'Corolla', 2025, 'XLi', 'أبيض', 'رمادي', 'petrol', '1.6L', 'automatic', 'fwd', 0, 'new', 22500, 375, 60, '["شاشة 7 انش","كاميرا خلفية","بلوتوث","ABS"]', 'sedan', 5, 'اليابان', 36, 100000, 'available'),
(2, 'Hyundai', 'Elantra', 2025, 'Smart', 'أبيض', 'أسود', 'petrol', '1.6L', 'automatic', 'fwd', 0, 'new', 22000, 366, 60, '["شاشة 8 انش","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'كوريا', 60, 100000, 'available'),
(2, 'MG', 'MG5', 2025, 'COM', 'فضي', 'أسود', 'petrol', '1.5L', 'automatic', 'fwd', 0, 'new', 15500, 258, 60, '["شاشة 8 انش","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'الصين', 60, 150000, 'available'),
(2, 'Kia', 'Sportage', 2025, 'LX', 'أبيض', 'أسود', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 0, 'new', 28000, 466, 60, '["شاشة 8 انش","كاميرا خلفية","حساسات"]', 'suv', 5, 'كوريا', 60, 100000, 'available'),
(2, 'Toyota', 'Camry', 2019, 'GLE', 'ذهبي', 'بيج', 'petrol', '2.5L', 'automatic', 'fwd', 82000, 'used', 19500, 325, 60, '["شاشة","كاميرا خلفية","مقاعد جلد"]', 'sedan', 5, 'اليابان', 6, 10000, 'available'),
(2, 'Hyundai', 'Tucson', 2020, 'GL', 'أبيض', 'رمادي', 'petrol', '1.6L Turbo', 'automatic', 'fwd', 62000, 'used', 19000, 316, 60, '["شاشة","كاميرا خلفية"]', 'suv', 5, 'كوريا', 6, 10000, 'available');

-- فرع الزرقاء
INSERT INTO car_inventory (branch_id, make, model, year, trim_level, color_exterior, color_interior, engine_type, engine_size, transmission, drivetrain, mileage, condition, price, monthly_installment, installment_months, features, body_type, seats, origin_country, warranty_months, warranty_km, status) VALUES
(3, 'MG', 'MG5', 2025, 'COM', 'أبيض', 'أسود', 'petrol', '1.5L', 'automatic', 'fwd', 0, 'new', 15500, 258, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'الصين', 60, 150000, 'available'),
(3, 'Chery', 'Tiggo 4 Pro', 2025, 'Comfort', 'أبيض', 'أسود', 'petrol', '1.5L Turbo', 'automatic', 'fwd', 0, 'new', 17500, 291, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'suv', 5, 'الصين', 60, 150000, 'available'),
(3, 'Toyota', 'Corolla', 2025, 'XLi', 'فضي', 'رمادي', 'petrol', '1.6L', 'automatic', 'fwd', 0, 'new', 22500, 375, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'اليابان', 36, 100000, 'available'),
(3, 'Hyundai', 'Elantra', 2024, 'GL', 'أبيض', 'رمادي', 'petrol', '1.6L', 'automatic', 'fwd', 15000, 'used', 19000, 316, 60, '["شاشة","كاميرا خلفية"]', 'sedan', 5, 'كوريا', 24, 50000, 'available'),
(3, 'Kia', 'Cerato', 2021, 'EX', 'رمادي', 'أسود', 'petrol', '1.6L', 'automatic', 'fwd', 45000, 'used', 16000, 266, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'sedan', 5, 'كوريا', 6, 10000, 'available');

-- فرع العقبة
INSERT INTO car_inventory (branch_id, make, model, year, trim_level, color_exterior, color_interior, engine_type, engine_size, transmission, drivetrain, mileage, condition, price, monthly_installment, installment_months, features, body_type, seats, origin_country, warranty_months, warranty_km, status) VALUES
(4, 'Toyota', 'Hilux', 2025, 'SR5', 'أبيض', 'رمادي', 'diesel', '2.4L', 'automatic', '4wd', 0, 'new', 40000, 666, 60, '["شاشة","كاميرا خلفية","نظام دفع رباعي"]', 'pickup', 5, 'تايلاند', 60, 150000, 'available'),
(4, 'Toyota', 'Land Cruiser Prado', 2024, 'VXL', 'أبيض لؤلؤي', 'بيج', 'petrol', '2.7L', 'automatic', '4wd', 0, 'new', 62000, 1033, 60, '["شاشة","كاميرا 360","7 مقاعد","مقاعد جلد","فتحة سقف"]', 'suv', 7, 'اليابان', 60, 100000, 'available'),
(4, 'MG', 'MG ZS', 2025, 'COM', 'أبيض', 'أسود', 'petrol', '1.5L', 'automatic', 'fwd', 0, 'new', 16500, 275, 60, '["شاشة","كاميرا خلفية","بلوتوث"]', 'suv', 5, 'الصين', 60, 150000, 'available'),
(4, 'Nissan', 'Patrol', 2022, 'SE', 'أبيض', 'بيج', 'petrol', '4.0L V6', 'automatic', '4wd', 42000, 'used', 45000, 750, 60, '["شاشة","كاميرا خلفية","8 مقاعد","دفع رباعي"]', 'suv', 8, 'اليابان', 6, 10000, 'available');

-- =============================================
-- العروض والحملات
-- =============================================
INSERT INTO promotions (title, description, type, discount_percentage, discount_amount, applicable_to, applicable_makes, start_date, end_date, terms_conditions, max_uses, is_active) VALUES
('عرض صيانة الصيف', 'خصم 20% على جميع خدمات الصيانة الدورية خلال فصل الصيف', 'seasonal', 20, NULL, 'services', NULL, '2026-06-01', '2026-08-31', 'العرض ساري على الصيانة الدورية فقط - لا يشمل قطع الغيار', 500, 1),
('باقة الأمان', 'فحص فرامل + تغيير بطانات + ترصيص بسعر مخفض', 'package', NULL, 30, 'services', NULL, '2026-03-01', '2026-12-31', 'شامل الفحص والتركيب - قطع الغيار بسعر منفصل', 200, 1),
('خصم ولاء العملاء', 'خصم 10% إضافي لعملاء أوتو جوردن المميزين على قطع الغيار', 'loyalty', 10, NULL, 'parts', NULL, '2026-01-01', '2026-12-31', 'للعملاء اللي عندهم أكثر من 3 زيارات صيانة', NULL, 1),
('عرض التمويل المريح', 'تمويل سيارات MG و Chery بدون دفعة أولى', 'financing', NULL, NULL, 'cars', '["MG","Chery"]', '2026-03-01', '2026-06-30', 'يتطلب كفيل وإثبات دخل - الفوائد حسب البنك الممول', 100, 1),
('عرض غسيل VIP مجاني', 'غسيل VIP مجاني مع كل صيانة دورية أكثر من 50 دينار', 'free_service', NULL, NULL, 'services', NULL, '2026-01-01', '2026-12-31', 'غسيل واحد مجاني مع كل فاتورة صيانة تتجاوز 50 دينار', NULL, 1),
('عرض Trade-In', 'أعلى تقييم لسيارتك القديمة عند شراء سيارة جديدة من المعرض', 'trade_in', NULL, NULL, 'cars', NULL, '2026-01-01', '2026-12-31', 'التقييم حسب حالة السيارة وموديلها - يحق لأوتو جوردن تحديد القيمة النهائية', NULL, 1),
('عرض رمضان كريم', 'خصم 15% على جميع خدمات السمكرة والدهان', 'seasonal', 15, NULL, 'services', NULL, '2026-02-18', '2026-03-20', 'شامل خدمات السمكرة والدهان - لا يشمل القطع', 300, 1);
