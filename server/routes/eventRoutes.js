const express = require('express')
const { listEvents, getEvent } = require('../controllers/eventController')
const { protect, restrictTo } = require('../middleware/authMiddleware')
const router = express.Router()
router.use(protect, restrictTo('Student'))
router.get('/', listEvents)
router.get('/:eventId', getEvent)
module.exports = router
