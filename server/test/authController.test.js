const test = require('node:test')
const assert = require('node:assert/strict')
const User = require('../models/User')
const { loginUser } = require('../controllers/authController')

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
    cookie(name, value, options) {
      this.cookieValue = { name, value, options }
      return this
    },
  }
}

async function requestLogin(user, password = 'wrong-password') {
  const originalFindOne = User.findOne
  User.findOne = () => ({ select: async () => user })
  const req = { body: { email: 'user@example.com', password } }
  const res = response()

  try {
    await loginUser(req, res)
    return res
  } finally {
    User.findOne = originalFindOne
  }
}

function mockUser(overrides = {}) {
  return {
    _id: 'user-id',
    name: 'Test User',
    email: 'user@example.com',
    role: 'Student',
    loginAttempts: 0,
    lockUntil: undefined,
    comparePassword: async () => false,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1
    },
    ...overrides,
  }
}

test('fifth failed login starts a 15-minute lockout', async () => {
  const user = mockUser({ loginAttempts: 4 })
  const beforeRequest = Date.now()

  const res = await requestLogin(user)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.payload, { status: 'fail', message: 'Invalid email or password' })
  assert.equal(user.loginAttempts, 5)
  assert.ok(user.lockUntil instanceof Date)
  assert.ok(user.lockUntil.getTime() >= beforeRequest + 15 * 60 * 1000)
  assert.ok(user.lockUntil.getTime() <= Date.now() + 15 * 60 * 1000)
  assert.equal(user.saveCalls, 1)
})

test('active lockout rejects login without checking the password or incrementing attempts', async () => {
  let passwordChecked = false
  const user = mockUser({
    loginAttempts: 5,
    lockUntil: new Date(Date.now() + 60_000),
    comparePassword: async () => {
      passwordChecked = true
      return true
    },
  })

  const res = await requestLogin(user, 'correct-password')

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.payload, { status: 'fail', message: 'Invalid email or password' })
  assert.equal(passwordChecked, false)
  assert.equal(user.loginAttempts, 5)
  assert.equal(user.saveCalls, 0)
})

test('expired lockout is cleared before a failed password starts a fresh count', async () => {
  const user = mockUser({
    loginAttempts: 5,
    lockUntil: new Date(Date.now() - 1),
  })

  const res = await requestLogin(user)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.payload, { status: 'fail', message: 'Invalid email or password' })
  assert.equal(user.loginAttempts, 1)
  assert.equal(user.lockUntil, undefined)
  assert.equal(user.saveCalls, 2)
})

test('successful login clears failed-attempt and lockout state', async (t) => {
  const originalSecret = process.env.JWT_SECRET
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  })
  process.env.JWT_SECRET = 'test-jwt-secret'

  const user = mockUser({
    loginAttempts: 3,
    lockUntil: new Date(Date.now() - 1),
    comparePassword: async () => true,
  })
  const res = await requestLogin(user, 'correct-password')

  assert.equal(res.statusCode, 200)
  assert.equal(user.loginAttempts, 0)
  assert.equal(user.lockUntil, undefined)
  assert.equal(user.saveCalls, 1)
  assert.equal(res.cookieValue.name, 'token')
})
