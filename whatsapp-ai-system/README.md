# 🤖 WhatsApp AI Dashboard
### نظام رد ذكي على واتساب مع داشبورد تحليلي متكامل

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.0_Flash-orange)](https://ai.google.dev)

---

## ✨ المميزات الرئيسية

- **🔄 رد تلقائي ذكي** - يستخدم Gemini AI للرد على رسائل واتساب بالعربية
- **📊 داشبورد تحليلي** - رسوم بيانية تفاعلية وإحصائيات لحظية
- **💬 إدارة المحادثات** - واجهة مشابهة لواتساب مع إمكانية الرد اليدوي
- **📝 تسجيل تلقائي** - كل محادثة تُسجَّل في Google Sheets
- **🌙 الوضع الداكن** - دعم كامل للوضع الداكن والفاتح
- **📱 متجاوب** - يعمل على الجوال والتابلت والكمبيوتر
- **🔒 أمان متكامل** - JWT + Rate Limiting + قائمة الحظر
- **⚡ لحظي** - Socket.io للتحديثات الفورية

---

## 📁 هيكل المشروع

```
whatsapp-ai-system/
├── server/                    # Backend (Node.js + Express)
│   ├── index.js               # نقطة الدخول الرئيسية
│   ├── config/
│   │   └── env.js             # إعدادات البيئة
│   ├── services/
│   │   ├── whatsapp.service.js  # WhatsApp Cloud API
│   │   ├── gemini.service.js    # Gemini AI
│   │   ├── sheets.service.js    # Google Sheets
│   │   └── analytics.service.js # التحليلات
│   ├── middleware/
│   │   └── auth.js            # JWT + Rate Limiting
│   ├── routes/
│   │   ├── webhook.routes.js  # استقبال رسائل واتساب
│   │   ├── conversations.routes.js
│   │   └── analytics.routes.js
│   └── utils/
│       ├── sentiment.js       # تحليل المشاعر
│       └── logger.js          # نظام اللوغ
├── client/                    # Frontend (React + Tailwind)
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx  # لوحة التحكم الرئيسية
│       │   ├── Conversations.jsx # المحادثات
│       │   ├── Analytics.jsx  # التحليلات المتقدمة
│       │   └── Settings.jsx   # الإعدادات
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── StatCard.jsx
│       │   └── ChatBubble.jsx
│       └── context/           # React Context (Auth, Theme, Socket)
├── .env.example               # مثال على المتغيرات البيئية
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## 🚀 التثبيت والتشغيل

### المتطلبات الأساسية
- Node.js 18+ ([تحميل](https://nodejs.org))
- حساب Meta Developer مع WhatsApp Business API
- Google Cloud Project مع Sheets API + Service Account
- Gemini API Key من Google AI Studio

---

### الخطوة 1: استنساخ المشروع

```bash
git clone https://github.com/your-repo/whatsapp-ai-system.git
cd whatsapp-ai-system
```

### الخطوة 2: إعداد المتغيرات البيئية

```bash
cp .env.example .env
```

افتح ملف `.env` وأضف قيمك:

> ⚠️ **تحذير أمني**: لا تلصق قيم حقيقية من هذه المتغيرات في أي مكان عام (GitHub, Slack, Screenshots). قبل أول commit تأكد أن `.env` و `*.key` و `*.pem` و `service-account.json` جميعها في `.gitignore`.

```env
# جميع القيم أدناه إلزامية — النظام لن يعمل بدونها
WHATSAPP_TOKEN=<from_meta_developer_portal>
WHATSAPP_PHONE_NUMBER_ID=<your_phone_id>
WHATSAPP_VERIFY_TOKEN=<generate_yourself_random_string>
GROQ_API_KEY=<from_groq_console>
ADMIN_USERNAME=<your_admin_username>
ADMIN_PASSWORD=<strong_password_min_12_chars>

# ولّد قيمة قوية:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=<min_32_chars_random_hex>

# حدد المواقع المسموح لها فقط (مفصولة بفواصل)
CORS_ORIGIN=https://yourdomain.com
```

### الخطوة 3: تثبيت الحزم

```bash
# تثبيت كل شيء دفعة واحدة
npm run install:all
```

أو يدوياً:
```bash
npm install
cd client && npm install && cd ..
```

### الخطوة 4: تشغيل وضع التطوير

```bash
# تشغيل السيرفر والفرونتند معاً
npm run dev:all
```

- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:5173
- **Health Check**: http://localhost:3000/health

---

## 🔧 إعداد WhatsApp Business Cloud API

### 1. إنشاء تطبيق Meta

1. اذهب إلى [Meta for Developers](https://developers.facebook.com)
2. أنشئ تطبيقاً جديداً من نوع **Business**
3. أضف منتج **WhatsApp**
4. احصل على **Phone Number ID** و **Permanent Access Token**

### 2. إعداد الـ Webhook

في إعدادات الـ WhatsApp في تطبيق Meta:

```
Webhook URL: https://your-domain.com/webhook
Verify Token: (نفس قيمة WHATSAPP_VERIFY_TOKEN في .env)
```

اشترك في الحدث: `messages`

### 3. اختبار الاستقبال

```bash
# اختبار الـ Webhook يدوياً
curl -X GET "https://your-domain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

---

## 🤖 إعداد Gemini AI

1. اذهب إلى [Google AI Studio](https://makersuite.google.com)
2. أنشئ API Key جديداً
3. أضفه في `.env` كـ `GEMINI_API_KEY`

الموديلات المدعومة:
- `gemini-2.0-flash` (الأسرع والأرخص - موصى به)
- `gemini-1.5-pro` (الأدق للمحادثات المعقدة)

---

## 📊 إعداد Google Sheets

### 1. إنشاء Service Account

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com)
2. أنشئ مشروعاً جديداً أو استخدم موجوداً
3. فعّل **Google Sheets API**
4. أنشئ **Service Account** واحفظ الـ JSON Key

### 2. إنشاء جدول البيانات

1. أنشئ Google Sheet جديد
2. شارك الـ Sheet مع بريد الـ Service Account (دور Editor)
3. انسخ الـ Spreadsheet ID من الـ URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

### 3. بنية الشيتات

سيُنشئ النظام تلقائياً شيتين:

**📋 Conversations Sheet:**
| Timestamp | Phone Number | Customer Name | Customer Message | AI Response | Response Time | Sentiment | Topic | Escalated |

**📈 Daily Summary Sheet:**
| Date | Total Messages | Avg Response Time | Top Topic | Positive % | Negative % | Escalation Rate |

---

## 🐳 النشر باستخدام Docker

```bash
# بناء وتشغيل
docker-compose up -d

# عرض اللوغ
docker-compose logs -f app

# إيقاف
docker-compose down
```

---

## 🌐 النشر على السحابة

### Render.com (مجاني)

1. اربط مستودعك بـ Render
2. أنشئ **Web Service** جديد
3. أضف متغيرات البيئة في لوحة التحكم
4. سيُنشر تلقائياً مع كل تحديث

### Railway

```bash
railway login
railway new
railway up
```

---

## 📡 API Reference

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Webhook

```http
GET  /webhook  # التحقق من الـ Webhook
POST /webhook  # استقبال الرسائل
```

### المحادثات

```http
GET  /api/conversations          # كل المحادثات
GET  /api/conversations/:phone   # محادثة رقم معين
POST /api/conversations/send     # إرسال رسالة يدوية
```

### التحليلات

```http
GET  /api/analytics              # بيانات التحليل الكاملة
GET  /api/analytics/summary      # ملخص سريع
GET  /api/analytics/export?format=csv  # تصدير CSV
```

### الإعدادات

```http
POST /api/analytics/settings/prompt          # تحديث System Prompt
POST /api/analytics/settings/knowledge-base  # تحديث قاعدة المعرفة
```

---

## 🔒 الأمان

| الميزة | التفاصيل |
|--------|----------|
| JWT Authentication | توكن منتهي الصلاحية بعد 7 أيام |
| Rate Limiting | 100 طلب / 15 دقيقة للـ API |
| Webhook Rate Limit | 200 رسالة / دقيقة |
| Login Rate Limit | 5 محاولات / 15 دقيقة |
| قائمة الحظر | حظر الأرقام المزعجة |
| CORS | محدود بالأصول المسموحة |
| Helmet | حماية HTTP headers |

---

## 🔑 بيانات الدخول الافتراضية

```
المستخدم: admin
كلمة المرور: admin123
```

> ⚠️ **تنبيه**: غيّر كلمة المرور في الإنتاج بتعديل ملف `server/middleware/auth.js`

---

## 🛠️ استكشاف الأخطاء

### الـ Webhook لا يستقبل رسائل
- تأكد أن الـ WHATSAPP_VERIFY_TOKEN صحيح
- تأكد أن الخادم متاح عبر الإنترنت (ليس localhost)
- استخدم [ngrok](https://ngrok.com) للتطوير: `ngrok http 3000`

### Gemini لا يرد
- تحقق من صحة الـ API Key
- تأكد من تفعيل Gemini API في مشروعك
- راجع اللوغ: `docker-compose logs -f app`

### Google Sheets لا تعمل
- تأكد من مشاركة الـ Sheet مع بريد الـ Service Account
- تحقق من صحة الـ GOOGLE_PRIVATE_KEY (يجب أن يحتوي على `\n`)

---

## 📊 المشاعر والمواضيع

### المشاعر المدعومة
- 😊 **إيجابي**: شكراً، ممتاز، رائع، مفيد...
- 😞 **سلبي**: مشكلة، بطيء، رديء، شكوى...
- 😐 **محايد**: الباقي

### المواضيع التلقائية
- أسعار • منتجات • شكاوى • دعم فني
- استفسارات • توصيل • إرجاع • عام

---

## 📄 الترخيص

MIT License - استخدم بحرية مع الإشارة للمصدر.

---

<div align="center">

بُني بـ ❤️ باستخدام Node.js + React + Gemini AI + WhatsApp Cloud API

</div>
