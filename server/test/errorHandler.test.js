const test = require('node:test')
const assert = require('node:assert/strict')
const errorHandler = require('../middleware/errorHandler')

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
  }
}

test('malformed JSON parser errors return a safe client error', () => {
  const res = response()
  errorHandler(
    { type: 'entity.parse.failed', message: 'secret parser detail' },
    {},
    res,
    () => {},
  )

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.payload, {
    status: 'fail',
    message: 'Malformed JSON request body',
  })
})

test('database validation and cast errors return a safe client error', () => {
  for (const error of [
    Object.assign(new Error('private schema path'), { name: 'ValidationError' }),
    Object.assign(new Error('private cast value'), { name: 'CastError' }),
  ]) {
    const res = response()
    errorHandler(error, {}, res, () => {})
    assert.equal(res.statusCode, 400)
    assert.deepEqual(res.payload, {
      status: 'fail',
      message: 'Invalid request data',
    })
  }
})

test('unexpected errors do not expose database details or stack traces', (t) => {
  const originalConsoleError = console.error
  const logged = []
  console.error = (...values) => logged.push(values)
  t.after(() => { console.error = originalConsoleError })

  const res = response()
  errorHandler(
    Object.assign(new Error('mongodb://user:password@host/database'), {
      name: 'MongoServerError',
    }),
    {},
    res,
    () => {},
  )

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.payload, {
    status: 'error',
    message: 'Internal server error',
  })
  assert.deepEqual(logged, [['Unhandled request error:', 'MongoServerError']])
})
