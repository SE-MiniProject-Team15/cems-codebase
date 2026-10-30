const express = require('express');
const {
  submitFeedback,
  getEventFeedback,
} = require('../controllers/feedbackController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/:eventId/feedback', protect, restrictTo('Student'), submitFeedback);
router.get('/:eventId/feedback', protect, getEventFeedback);

module.exports = router;
