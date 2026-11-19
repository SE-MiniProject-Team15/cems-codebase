const rateLimit = require('express-rate-limit')

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Too many check-in attempts. Try again later.',
  },
})
