
const express = require('express');
const {
  createEvent,
  listMyEvents,
  updateEvent,
  cancelEvent,
  approveEvent,
  listPublicEvents,
} = require('../controllers/eventController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

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

// Admins can approve pending events.
router.patch('/:id/approve', restrictTo('Admin'), approveEvent);

module.exports = router;
