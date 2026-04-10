/**
 * أوتو جوردن - Management Routes
 * إدارة الحجوزات والسيارات وقطع الغيار والتذاكر
 * All handlers are async — db calls return Promises
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// ============================================
// الحجوزات والمواعيد
// ============================================

/** GET /api/manage/bookings */
router.get('/bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await db.getAllBookings(req.query);
    const stats = {
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      completed: bookings.filter(b => b.status === 'completed').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
    };
    res.json({ success: true, stats, data: bookings });
  } catch (err) {
    logger.error('❌ خطأ في جلب الحجوزات:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/manage/bookings/:id/status */
router.put('/bookings/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    }
    const booking = await db.updateBookingStatus(req.params.id, status, notes);
    if (!booking) return res.status(404).json({ success: false, message: 'الحجز غير موجود' });
    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// إدارة مخزون السيارات
// ============================================

/** GET /api/manage/cars */
router.get('/cars', authenticateToken, async (req, res) => {
  try {
    const cars = await db.getAllCars();
    const stats = {
      total: cars.length,
      available: cars.filter(c => c.status === 'available').length,
      sold: cars.filter(c => c.status === 'sold').length,
      reserved: cars.filter(c => c.status === 'reserved').length,
      new: cars.filter(c => c.condition === 'new').length,
      used: cars.filter(c => c.condition === 'used').length,
    };
    res.json({ success: true, stats, data: cars });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/manage/cars */
router.post('/cars', authenticateToken, async (req, res) => {
  try {
    const required = ['make', 'model', 'year', 'price'];
    for (const field of required) {
      if (!req.body[field]) return res.status(400).json({ success: false, message: `حقل ${field} مطلوب` });
    }
    const car = await db.addCar(req.body);
    res.status(201).json({ success: true, data: car });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/manage/cars/:id */
router.put('/cars/:id', authenticateToken, async (req, res) => {
  try {
    const car = await db.updateCar(req.params.id, req.body);
    if (!car) return res.status(404).json({ success: false, message: 'السيارة غير موجودة' });
    res.json({ success: true, data: car });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** DELETE /api/manage/cars/:id */
router.delete('/cars/:id', authenticateToken, async (req, res) => {
  try {
    const success = await db.deleteCar(req.params.id);
    if (!success) return res.status(404).json({ success: false, message: 'السيارة غير موجودة' });
    res.json({ success: true, message: 'تم حذف السيارة' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// إدارة قطع الغيار
// ============================================

/** GET /api/manage/parts */
router.get('/parts', authenticateToken, async (req, res) => {
  try {
    const parts = await db.getAllParts();
    const stats = {
      total: parts.length,
      low_stock: parts.filter(p => p.quantity <= (p.min_quantity || 5)).length,
      out_of_stock: parts.filter(p => p.quantity === 0).length,
      categories: [...new Set(parts.map(p => p.category))].length,
    };
    res.json({ success: true, stats, data: parts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/manage/parts/:id */
router.put('/parts/:id', authenticateToken, async (req, res) => {
  try {
    const part = await db.updatePart(req.params.id, req.body);
    if (!part) return res.status(404).json({ success: false, message: 'القطعة غير موجودة' });
    res.json({ success: true, data: part });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/manage/parts */
router.post('/parts', authenticateToken, async (req, res) => {
  try {
    const required = ['name', 'part_number', 'category', 'price'];
    for (const field of required) {
      if (!req.body[field]) return res.status(400).json({ success: false, message: `حقل ${field} مطلوب` });
    }
    const part = await db.addPart(req.body);
    res.status(201).json({ success: true, data: part });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// إحصائيات الفروع
// ============================================

/** GET /api/manage/branches */
router.get('/branches', authenticateToken, async (req, res) => {
  try {
    const branches = await db.getBranchStats();
    res.json({ success: true, data: branches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// تذاكر الدعم
// ============================================

/** GET /api/manage/tickets */
router.get('/tickets', authenticateToken, async (req, res) => {
  try {
    const tickets = await db.getAllTickets(req.query);
    const stats = {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
    };
    res.json({ success: true, stats, data: tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/manage/tickets/:id */
router.put('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await db.updateTicket(req.params.id, req.body);
    if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة' });
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// استفسارات الشراء
// ============================================

/** GET /api/manage/inquiries */
router.get('/inquiries', authenticateToken, async (req, res) => {
  try {
    const inquiries = await db.getAllInquiries(req.query);
    const stats = {
      total: inquiries.length,
      new: inquiries.filter(i => i.status === 'new').length,
      contacted: inquiries.filter(i => i.status === 'contacted').length,
      qualified: inquiries.filter(i => i.status === 'qualified').length,
      closed: inquiries.filter(i => i.status === 'closed').length,
    };
    res.json({ success: true, stats, data: inquiries });
  } catch (err) {
    logger.error('❌ خطأ في جلب الاستفسارات:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/manage/inquiries/:id */
router.put('/inquiries/:id', authenticateToken, async (req, res) => {
  try {
    const inquiry = await db.updateInquiry(req.params.id, req.body);
    if (!inquiry) return res.status(404).json({ success: false, message: 'الاستفسار غير موجود' });
    res.json({ success: true, data: inquiry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================
// إحصائيات مباشرة للداشبورد
// ============================================

/** GET /api/manage/live-stats */
router.get('/live-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getLiveStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('❌ خطأ في جلب الإحصائيات:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
