const crypto = require('node:crypto')

function requestId(req, res, next) {
  req.id = crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)

  const json = res.json
  res.json = function jsonWithRequestId(payload) {
    if (this.statusCode >= 400 && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload = { ...payload, requestId: req.id }
    }
    return json.call(this, payload)
  }

  next()
}

module.exports = requestId
