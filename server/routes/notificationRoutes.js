
const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Get the logged-in user's notifications, newest first.
router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id,
    }).sort({ createdAt: -1 });

    return res.json({
      status: 'success',
      data: { notifications },
    });
  } catch (error) {
    return next(error);
  }
});

// Mark one of the logged-in user's notifications as read.
router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user._id,
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        status: 'fail',
        message: 'Notification not found',
      });
    }

    return res.json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
