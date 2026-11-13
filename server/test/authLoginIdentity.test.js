const test = require('node:test')
const assert = require('node:assert/strict')
const User = require('../models/User')
const { loginUser } = require('../controllers/authController')

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
    cookie() {
      return this
    },
  }
}

test('successful login selects lockout fields and retains public identity in its response', async (t) => {
  const originalFindOne = User.findOne
  const originalSecret = process.env.JWT_SECRET
  let selectedFields
  const user = {
    _id: 'user-id',
    name: 'Organizer Name',
    email: 'organizer@example.com',
    role: 'Organizer',
    loginAttempts: 0,
    lockUntil: undefined,
    comparePassword: async () => true,
    async save() {},
  }
  User.findOne = () => ({
    select: async (fields) => {
      selectedFields = fields
      return user
    },
  })
  process.env.JWT_SECRET = 'test-jwt-secret'
  t.after(() => {
    User.findOne = originalFindOne
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  })

  const res = response()
  await loginUser(
    { body: { email: user.email, password: 'Validpass1' } },
    res,
  )

  assert.equal(selectedFields, '+password +loginAttempts +lockUntil')
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload.data.user, {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
})
