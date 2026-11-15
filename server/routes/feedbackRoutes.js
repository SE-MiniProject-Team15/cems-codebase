const express = require('express');
const {
  submitFeedback,
  getMyFeedback,
  getEventFeedback,
  getAdminFeedbackSummary,
  listEligibleFeedbackEvents,
} = require('../controllers/feedbackController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/feedback/eligible',
  protect,
  restrictTo('Student'),
  listEligibleFeedbackEvents
);
router.post(
  '/events/:id/feedback',
  protect,
  restrictTo('Student'),
  submitFeedback
);
router.get(
  '/events/:id/feedback/me',
  protect,
  restrictTo('Student'),
  getMyFeedback
);
router.get(
  '/events/:id/feedback',
  protect,
  restrictTo('Organizer', 'Admin'),
  getEventFeedback
);
router.get(
  '/admin/feedback/summary',
  protect,
  restrictTo('Admin'),
  getAdminFeedbackSummary
);

module.exports = router;
