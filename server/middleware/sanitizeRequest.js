const blockedKeys = new Set(['__proto__', 'prototype', 'constructor'])

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (!value || typeof value !== 'object') return value

  const sanitized = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.includes('$') || key.includes('.') || blockedKeys.has(key)) continue
    sanitized[key] = sanitizeValue(nestedValue)
  }
  return sanitized
}

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  Object.defineProperty(req, 'query', {
    configurable: true,
    enumerable: true,
    value: sanitizeValue(req.query),
  })
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params)
  }
  next()
}

module.exports = sanitizeRequest
