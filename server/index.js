/**
 * Server Entry Point - للتشغيل المحلي فقط
 * Netlify يستخدم netlify/functions/api.js
 */

const http = require('http');
const schedule = require('node-schedule');
const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');

const server = http.createServer(app);
const PORT = config.server.port;

// تحديث الملخص اليومي كل يوم منتصف الليل
schedule.scheduleJob('0 0 * * *', () => {
  logger.info('تحديث الملخص اليومي...');
});

server.listen(PORT, () => {
  logger.success(`
  ╔═══════════════════════════════════════════╗
  ║   WhatsApp AI Dashboard - Local Server    ║
  ║   السيرفر يعمل على: http://localhost:${PORT}  ║
  ╠═══════════════════════════════════════════╣
  ║   Webhook:  http://localhost:${PORT}/webhook   ║
  ║   API:      http://localhost:${PORT}/api       ║
  ║   Health:   http://localhost:${PORT}/health    ║
  ╚═══════════════════════════════════════════╝
  `);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

module.exports = { app, server };
