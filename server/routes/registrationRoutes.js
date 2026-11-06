const express = require('express');
const { listMyRegistrations } = require('../controllers/registrationController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', protect, restrictTo('Student'), listMyRegistrations);

module.exports = router;
