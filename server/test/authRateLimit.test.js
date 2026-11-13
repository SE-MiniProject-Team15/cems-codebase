const test = require('node:test');
const assert = require('node:assert/strict');
const authRateLimit = require('../middleware/authRateLimit');

function response() {
  return {
<<<<<<< HEAD
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
=======
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function request(ip) {
  return { ip, socket: { remoteAddress: 'fallback' } };
}

test('rate limiter validates its endpoint and allows requests within a window', () => {
  assert.throws(() => authRateLimit(), /endpoint ID is required/);
  assert.throws(() => authRateLimit(''), /endpoint ID is required/);
  assert.throws(() => authRateLimit(1), /endpoint ID is required/);

  let nextCalls = 0;
  const res = response();
  authRateLimit(`allowed-${Math.random()}`)(request('198.51.100.1'), res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
});

test('rate limiter blocks the eleventh request and allows a new expired window', (t) => {
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });

  const middleware = authRateLimit(`limit-${Math.random()}`);
  let nextCalls = 0;
  for (let index = 0; index < 10; index += 1) {
    const res = response();
    middleware(request('198.51.100.2'), res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 200);
  }
  const blocked = response();
  middleware(request('198.51.100.2'), blocked, () => { nextCalls += 1; });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '900');
  assert.equal(nextCalls, 10);

  now += 15 * 60 * 1000 + 1;
  const afterExpiry = response();
  middleware(request('198.51.100.2'), afterExpiry, () => { nextCalls += 1; });
  assert.equal(afterExpiry.statusCode, 200);
  assert.equal(nextCalls, 11);
});

test('rate limiter evicts expired keys when at capacity and rejects when still full', (t) => {
  const originalNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });

  const middleware = authRateLimit('capacity-test');
  for (let index = 0; index < 50_000; index += 1) {
    middleware(request(`192.0.2.${index}`), response(), () => {});
  }

  const full = response();
  middleware(request('203.0.113.full'), full, () => {});
  assert.equal(full.statusCode, 503);

  now += 15 * 60 * 1000 + 1;
  const afterCleanup = response();
  let passed = false;
  middleware(request('203.0.113.after'), afterCleanup, () => { passed = true; });
  assert.equal(afterCleanup.statusCode, 200);
  assert.equal(passed, true);
>>>>>>> 398e39a25ccea38efe329fce39a0d87eb6e079f3
});
