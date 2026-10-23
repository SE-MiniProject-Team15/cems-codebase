const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { getJwtSecret } = require('../config/auth')
async function protect(req, res, next) {
  const authorization = req.headers.authorization
  const bearerToken = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    : undefined
  const token = req.cookies?.token || bearerToken
  if (!token) {
    return res.status(401).json({ status: 'fail', message: 'You are not logged in. Please log in to get access.' })
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    const user = await User.findById(decoded.id)
    if (!user) {
      return res.status(401).json({ status: 'fail', message: 'The user belonging to this token no longer exists.' })
    }
    req.user = user
    return next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error.message === 'JWT_SECRET is not configured') {
      return res.status(401).json({ status: 'fail', message: 'Invalid or expired token. Please log in again.' })
    }
    return next(error)
  }
}
function restrictTo(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ status: 'fail', message: 'You do not have permission to perform this action.' })
    }
    return next()
  }
}
module.exports = { protect, restrictTo }
