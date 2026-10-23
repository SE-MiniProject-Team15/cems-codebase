const windows = new Map()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
const MAX_KEYS = 50000
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}, WINDOW_MS).unref()
function authRateLimit(req, res, next) {
  const now = Date.now()
  const clientAddress = req.socket?.remoteAddress || 'unknown'
  const key = clientAddress + ':' + req.baseUrl + req.path
  let window = windows.get(key)
  if (!window || window.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      for (const [existingKey, existingWindow] of windows) {
        if (existingWindow.resetAt <= now) windows.delete(existingKey)
      }
      if (windows.size >= MAX_KEYS) {
        return res.status(503).json({ status: 'fail', message: 'Authentication is temporarily unavailable. Please try again shortly.' })
      }
    }
    window = { count: 0, resetAt: now + WINDOW_MS }
    windows.set(key, window)
  }
  if (window.count >= MAX_ATTEMPTS) {
    res.set('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)))
    return res.status(429).json({ status: 'fail', message: 'Too many authentication attempts. Please try again later.' })
  }
  window.count += 1
  return next()
}
module.exports = authRateLimit
