
const express = require('express');
const {
  createEvent,
  listMyEvents,
  updateEvent,
  cancelEvent,
  approveEvent,
  listPendingEvents,
  getPendingEventDetails,
  decideEvent,
  listPublicEvents,
  listEvents,
  getEvent,
  checkInStudent,
  listAttendance,
  listAttendanceOverview,
  listAdminAuditLogs,
} = require('../controllers/eventController');
const {
  registerForEvent,
  cancelRegistration,
} = require('../controllers/registrationController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const checkInRateLimit = require('../middleware/checkInRateLimit');

const router = express.Router();

// Publicly visible events must be approved.
router.get('/public', listPublicEvents);

// All routes below require authentication.
router.use(protect);

// Organizers can manage their own events.
router.post('/', restrictTo('Organizer'), createEvent);
router.get('/mine', restrictTo('Organizer'), listMyEvents);
router.patch('/:id', restrictTo('Organizer'), updateEvent);
router.patch('/:id/cancel', restrictTo('Organizer'), cancelEvent);

// Administrator review endpoints.
router.get('/admin/pending', restrictTo('Admin'), listPendingEvents);
router.get('/admin/pending/:id', restrictTo('Admin'), getPendingEventDetails);
router.patch('/admin/:id/decision', restrictTo('Admin'), decideEvent);

// Retain the original approval route with the same guarded decision flow.
router.patch('/:id/approve', restrictTo('Admin'), approveEvent);
router.get('/admin/audit-logs', restrictTo('Admin'), listAdminAuditLogs);
router.get('/attendance/overview', restrictTo('Admin'), listAttendanceOverview);
router.get('/:eventId/attendance', restrictTo('Organizer', 'Admin'), listAttendance);
router.post('/:eventId/attendance/check-in', restrictTo('Organizer'), checkInRateLimit, checkInStudent);
router.post('/:id/check-in', restrictTo('Organizer'), checkInRateLimit, checkInStudent);

router.get('/', restrictTo('Student'), listEvents);
router.post('/:eventId/register', restrictTo('Student'), registerForEvent);
router.delete('/:eventId/register', restrictTo('Student'), cancelRegistration);
router.get('/:eventId', restrictTo('Student'), getEvent);

module.exports = router;
