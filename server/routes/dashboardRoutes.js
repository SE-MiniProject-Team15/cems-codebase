const express = require('express')
const { protect, restrictTo } = require('../middleware/authMiddleware')
const router = express.Router()
router.use(protect)
router.get('/student', restrictTo('Student'), (req, res) => {
  res.json({ status: 'success', data: { role: req.user.role } })
})
router.get('/organizer', restrictTo('Organizer'), (req, res) => {
  res.json({ status: 'success', data: { role: req.user.role } })
})
router.get('/admin', restrictTo('Admin'), (req, res) => {
  res.json({ status: 'success', data: { role: req.user.role } })
})
module.exports = router
