const express = require('express')
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController')
const { protect } = require('../middleware/authMiddleware')
const authRateLimit = require('../middleware/authRateLimit')
const router = express.Router()

router.post('/register', authRateLimit('register'), registerUser)
router.post('/login', authRateLimit('login'), loginUser)
router.post('/forgot-password', authRateLimit('forgot-password'), forgotPassword)
router.post('/reset-password/:token', authRateLimit('reset-password'), resetPassword)

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
  })
  return res.status(200).json({ status: 'success', message: 'Logged out successfully' })
})

router.get('/me', protect, (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    },
  })
})

module.exports = router
