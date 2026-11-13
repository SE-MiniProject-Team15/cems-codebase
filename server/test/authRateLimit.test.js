const test = require('node:test');
const assert = require('node:assert/strict');
const authRateLimit = require('../middleware/authRateLimit');

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('authentication requests are rate limited after the configured window quota', () => {
  const middleware = authRateLimit('test-login-limit');
  const req = {
    ip: `test-client-${Date.now()}-${Math.random()}`,
    socket: { remoteAddress: '127.0.0.1' },
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let nextCalled = false;
    middleware(req, response(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  }

  const res = response();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) > 0);
});
