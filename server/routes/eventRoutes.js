const express = require('express');
const {
  createEvent,
  listMyEvents,
  updateEvent,
  cancelEvent,
  approveEvent,
  listPublicEvents,
  listEvents,
  getEvent,
} = require('../controllers/eventController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// Public browse remains the simple event-management listing; discovery is student-only.
router.get('/public', listPublicEvents);

router.use(protect);

router.post('/', restrictTo('Organizer'), createEvent);
router.get('/mine', restrictTo('Organizer'), listMyEvents);
router.patch('/:id', restrictTo('Organizer'), updateEvent);
router.patch('/:id/cancel', restrictTo('Organizer'), cancelEvent);
router.patch('/:id/approve', restrictTo('Admin'), approveEvent);

router.get('/', restrictTo('Student'), listEvents);
router.get('/:eventId', restrictTo('Student'), getEvent);

module.exports = router;
