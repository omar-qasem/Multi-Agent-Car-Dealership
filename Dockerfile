# ============================================================
# مرحلة البناء - Frontend
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --silent

COPY client/ .
RUN npm run build

# ============================================================
# مرحلة الإنتاج - Backend + Frontend
# ============================================================
FROM node:20-alpine AS production

# تثبيت الأدوات الضرورية
RUN apk add --no-cache curl

WORKDIR /app

# نسخ ملفات الـ package
COPY package*.json ./
RUN npm ci --only=production --silent

# نسخ كود السيرفر
COPY server/ ./server/

# نسخ الـ frontend المبني
COPY --from=frontend-builder /app/client/dist ./client/dist

# متغيرات البيئة الافتراضية
ENV NODE_ENV=production
ENV PORT=3000

# فتح المنفذ
EXPOSE 3000

# فحص الصحة
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# تشغيل السيرفر
CMD ["node", "server/index.js"]
