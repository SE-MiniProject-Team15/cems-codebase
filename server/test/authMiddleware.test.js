const test = require('node:test')
const assert = require('node:assert/strict')
const { restrictTo } = require('../middleware/authMiddleware')
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
