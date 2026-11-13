const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { protect, restrictTo } = require('../middleware/authMiddleware')
function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}
test('restrictTo allows the matching role', () => {
  const req = { user: { role: 'Organizer' } }
  const res = response()
  let called = false
  restrictTo('Organizer')(req, res, () => { called = true })
  assert.equal(called, true)
  assert.equal(res.statusCode, 200)
})
test('restrictTo rejects a different role', () => {
  const req = { user: { role: 'Student' } }
  const res = response()
  let called = false
  restrictTo('Admin')(req, res, () => { called = true })
  assert.equal(called, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.message, 'You do not have permission to perform this action.')
})

test('protect rejects tampered and expired JWTs before user lookup', async (t) => {
  const originalSecret = process.env.JWT_SECRET
  const originalFindById = User.findById
  const secret = 'local-test-jwt-secret'
  process.env.JWT_SECRET = secret
  let userLookups = 0
  User.findById = async () => {
    userLookups += 1
    return { _id: 'student-id' }
  }
  t.after(() => {
    User.findById = originalFindById
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET
    } else {
      process.env.JWT_SECRET = originalSecret
    }
  })

  const validToken = jwt.sign({ id: 'student-id' }, secret, { expiresIn: '1d' })
  const expiredToken = jwt.sign({ id: 'student-id' }, secret, { expiresIn: -1 })
  const tamperedToken = `${validToken.slice(0, -1)}x`

  for (const token of [tamperedToken, expiredToken]) {
    const res = response()
    await protect({
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    }, res, (error) => {
      throw error;
    })

    assert.equal(res.statusCode, 401)
    assert.match(res.payload.message, /invalid or expired token/i)
  }

  assert.equal(userLookups, 0)
})
