# 🔗 دليل إعداد الـ Webhook - خطوة بخطوة

## المشكلة الشائعة وسببها

كل مرة تحاول إعداد الـ Webhook في Meta وتحصل على خطأ، السبب الغالب واحد من ثلاثة:
1. **الـ URL مش شغال** (localhost لا يعمل، تحتاج HTTPS عام)
2. **الـ Verify Token مش متطابق** بين الكود وMeta
3. **الخادم ما رد بشكل صحيح** (يجب إرجاع challenge كـ plain text)

---

## ✅ الحل الكامل (بعد النشر على Netlify)

### الخطوة 1: انشر على Netlify أولاً

1. اذهب إلى [netlify.com](https://netlify.com) وأنشئ حساباً
2. اضغط **"Add new site" → "Import an existing project"**
3. اربطه بـ GitHub (ارفع الكود أولاً)
4. إعدادات البناء:
   - **Build command:** `npm run build:netlify`
   - **Publish directory:** `client/dist`
   - **Functions directory:** `netlify/functions`

### الخطوة 2: أضف متغيرات البيئة في Netlify

اذهب لـ **Site Settings → Environment Variables** وأضف:

```
WHATSAPP_TOKEN         = [نفس قيمة WHATSAPP_TOKEN في ملف .env]
WHATSAPP_PHONE_NUMBER_ID = 1009756545544920
WHATSAPP_VERIFY_TOKEN  = wa_verify_secure_2024_omar
GEMINI_API_KEY         = [نفس قيمة GEMINI_API_KEY في ملف .env]
GEMINI_MODEL           = gemini-2.0-flash
JWT_SECRET             = wa_dashboard_jwt_secret_omar_2024_change_this
NODE_ENV               = production
```

### الخطوة 3: احصل على رابط موقعك

بعد النشر، Netlify يعطيك رابطاً مثل:
```
https://amazing-site-name.netlify.app
```

### الخطوة 4: اختبر الـ Webhook قبل إعداده في Meta

افتح المتصفح واكتب هذا الرابط:
```
https://amazing-site-name.netlify.app/webhook?hub.mode=subscribe&hub.verify_token=wa_verify_secure_2024_omar&hub.challenge=TEST123
```

**إذا شغال صح:** ستظهر كلمة `TEST123` في المتصفح ✅
**إذا خطأ:** راجع الخطوات من البداية ❌

---

## الخطوة 5: إعداد الـ Webhook في Meta Developer Console

1. اذهب إلى [developers.facebook.com](https://developers.facebook.com)
2. اختر تطبيقك → **WhatsApp → Configuration**
3. في قسم **Webhook**، اضغط **Edit**
4. أدخل:
   - **Callback URL:** `https://amazing-site-name.netlify.app/webhook`
   - **Verify Token:** `wa_verify_secure_2024_omar`
5. اضغط **Verify and Save**

> ⚠️ **مهم:** الـ Verify Token في Meta يجب أن يكون **بالضبط** نفس القيمة في ملف `.env` بدون مسافات زائدة

6. بعد التحقق، اشترك في الحدث:
   - اضغط **Manage** بجانب الـ Webhook
   - فعّل: **messages** ✅

---

## 🧪 اختبار كامل بعد الإعداد

أرسل رسالة لرقمك عبر WhatsApp وانتظر الرد التلقائي.

يمكنك أيضاً اختبار بـ curl:
```bash
curl -X POST https://amazing-site-name.netlify.app/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "metadata": {"phone_number_id": "1009756545544920"},
          "messages": [{"id": "test1", "from": "966501234567", "timestamp": "1700000000", "type": "text", "text": {"body": "مرحبا"}}],
          "contacts": [{"profile": {"name": "تجربة"}, "wa_id": "966501234567"}]
        }
      }]
    }]
  }'
```

---

## 🛠️ للتطوير المحلي (بدون Netlify)

استخدم **ngrok** لجعل localhost متاحاً للإنترنت:

```bash
# تثبيت ngrok
npm install -g ngrok

# تشغيل السيرفر
npm run dev

# في terminal آخر
ngrok http 3000
```

ngrok سيعطيك رابطاً مثل `https://abc123.ngrok.io`
استخدم: `https://abc123.ngrok.io/webhook` كـ Callback URL في Meta

---

## ❓ أسئلة شائعة

**س: الـ Webhook يتحقق بنجاح لكن ما تصل رسائل؟**
ج: تأكد من الاشتراك في حدث `messages` في إعدادات الـ Webhook

**س: "Error validating access token"؟**
ج: الـ WHATSAPP_TOKEN منتهي أو غير صحيح. جدّده من Meta Developer Console

**س: الرد يأتي إنجليزي بدل عربي؟**
ج: راجع System Prompt في الإعدادات وتأكد من توجيه اللغة العربية
