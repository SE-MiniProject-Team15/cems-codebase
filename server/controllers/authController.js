const User = require('../models/User')
const jwt = require('jsonwebtoken')
const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const { getJwtSecret } = require('../config/auth')
const { sendNotificationEmail } = require('../services/notificationService')
function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}
function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  })
}
async function registerUser(req, res) {
  const { name, email: submittedEmail, password, role: submittedRole } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ status: 'fail', message: 'Name is required' })
  }
  if (typeof submittedEmail !== 'string' || !submittedEmail.trim()) {
    return res.status(400).json({ status: 'fail', message: 'A valid email address is required' })
  }
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ status: 'fail', message: 'Password is required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters' })
  }
  const email = submittedEmail.trim().toLowerCase()
  try {
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ status: 'fail', message: 'Email already registered' })
    }
    let role = 'Student'
    if (submittedRole !== undefined && submittedRole !== null) {
      if (typeof submittedRole !== 'string') {
        return res.status(400).json({ status: 'fail', message: 'Role must be Student or Organizer' })
      }
      const normalizedRole = submittedRole.trim().toLowerCase()
      if (normalizedRole === 'admin') {
        return res.status(403).json({ status: 'fail', message: 'Administrator accounts cannot be self-registered' })
      }
      if (normalizedRole === 'student') role = 'Student'
      else if (normalizedRole === 'organizer') role = 'Organizer'
      else if (normalizedRole) {
        return res.status(400).json({ status: 'fail', message: 'Role must be Student or Organizer' })
      }
    }
    const user = await User.create({ name: name.trim(), email, password, role })
    return res.status(201).json({
      status: 'success',
      message: 'Registration successful',
      data: { user: serializeUser(user) },
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'fail', message: 'Email already registered' })
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ status: 'fail', message: 'Invalid registration details' })
    }
    console.error('Registration failed:', error.name || 'Error')
    return res.status(500).json({ status: 'error', message: 'Unable to complete request' })
  }
}

async function loginUser(req, res) {
  const { email: submittedEmail, password } = req.body || {}
  if (typeof submittedEmail !== 'string' || !submittedEmail.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ status: 'fail', message: 'Email and password are required' })
  }

  try {
    const email = submittedEmail.trim().toLowerCase()
    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil')
    const authenticationFailure = { status: 'fail', message: 'Invalid email or password' }
    const now = Date.now()

    if (user?.lockUntil && user.lockUntil.getTime() > now) {
      return res.status(423).json({
        status: 'fail',
        message: 'Account locked, try again later',
      })
    }

    if (!user) {
      return res.status(401).json(authenticationFailure)
    }

    if (user.lockUntil) {
      user.loginAttempts = 0
      user.lockUntil = undefined
      await user.save()
    }

    if (!(await user.comparePassword(password))) {
      user.loginAttempts += 1
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000)
      }
      await user.save()
      return res.status(401).json(authenticationFailure)
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0
      user.lockUntil = undefined
      await user.save()
    }

    const token = jwt.sign({ id: user._id, role: user.role }, getJwtSecret(), { expiresIn: '1d' })
    setAuthCookie(res, token)
    return res.status(200).json({ status: 'success', data: { user: serializeUser(user) } })
  } catch (error) {
    console.error('Login failed:', error.name || 'Error')
    return res.status(500).json({ status: 'error', message: 'Unable to complete request' })
  }
}

const PASSWORD_RESET_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.'

async function forgotPassword(req, res) {
  const submittedEmail = req.body?.email
  if (typeof submittedEmail === 'string' && submittedEmail.trim()) {
    try {
      const email = submittedEmail.trim().toLowerCase()
      const user = await User.findOne({ email })

      if (user) {
        const token = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        const expires = new Date(Date.now() + 30 * 60 * 1000)
        user.resetPasswordToken = tokenHash
        user.resetPasswordExpires = expires
        await user.save()

        const clientOrigin = process.env.CLIENT_URL ||
          process.env.CLIENT_ORIGIN ||
          'http://localhost:5173'
        const resetUrl = `${clientOrigin.replace(/\/+$/, '')}/reset-password/${token}`
        await sendNotificationEmail(
          email,
          'Reset your CEMS password',
          `Use this link to reset your password within 30 minutes:\n\n${resetUrl}\n\nIf you did not request a reset, you can ignore this email.`
        )
      }
    } catch (error) {
      console.error('Password reset request failed:', error.name || 'Error')
    }
  }

  return res.status(200).json({
    status: 'success',
    message: PASSWORD_RESET_MESSAGE,
  })
}

async function resetPassword(req, res) {
  const { token } = req.params
  const { password } = req.body || {}

  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ status: 'fail', message: 'Invalid or expired reset link' })
  }
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ status: 'fail', message: 'Password is required' })
  }
  if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password must be at least 8 characters and contain a letter and a digit',
    })
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await User.findOneAndUpdate(
      {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { $gt: new Date() },
      },
      {
        $set: { password: hashedPassword },
        $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
      },
      { returnDocument: 'after', runValidators: true }
    )

    if (!user) {
      return res.status(400).json({ status: 'fail', message: 'Invalid or expired reset link' })
    }

    return res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
    })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 'fail',
        message: 'Password must be at least 8 characters and contain a letter and a digit',
      })
    }
    console.error('Password reset failed:', error.name || 'Error')
    return res.status(500).json({ status: 'error', message: 'Unable to complete request' })
  }
}

module.exports = { registerUser, loginUser, forgotPassword, resetPassword }
