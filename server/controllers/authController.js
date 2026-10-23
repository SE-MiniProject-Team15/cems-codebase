const User = require('../models/User')
const jwt = require('jsonwebtoken')
const { getJwtSecret } = require('../config/auth')
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
async function registerUser(req, res, next) {
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
    const token = jwt.sign({ id: user._id, role: user.role }, getJwtSecret(), { expiresIn: '1d' })
    setAuthCookie(res, token)
    return res.status(201).json({ status: 'success', data: { user: serializeUser(user) } })
  } catch (error) {
    if
