
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/authMiddleware');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('protect rejects a request without a token', async () => {
  const req = { headers: {}, cookies: {} };
  const res = response();

  await protect(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.status, 'fail');
});

test('protect rejects an invalid token', async (t) => {
  const originalSecret = process.env.JWT_SECRET;

  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  process.env.JWT_SECRET = 'test-secret';

  const req = {
    headers: {},
    cookies: { token: 'invalid-token' },
  };
  const res = response();

  await protect(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(
    res.payload.message,
    'Invalid or expired token. Please log in again.'
  );
});

test('protect accepts a valid cookie token', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    User.findById = originalFindById;
  });

  process.env.JWT_SECRET = 'test-secret';

  const user = {
    _id: 'user-123',
    role: 'Student',
  };

  User.findById = async (id) => {
    assert.equal(id, 'user-123');
    return user;
  };

  const token = jwt.sign({ id: 'user-123' }, 'test-secret');

  const req = {
    headers: {},
    cookies: { token },
  };
  const res = response();
  let called = false;

  await protect(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user, user);
});

test('protect accepts a valid Bearer token', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    User.findById = originalFindById;
  });

  process.env.JWT_SECRET = 'test-secret';

  const user = {
    _id: 'user-456',
    role: 'Organizer',
  };

  User.findById = async () => user;

  const token = jwt.sign({ id: 'user-456' }, 'test-secret');

  const req = {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
  };
  const res = response();
  let called = false;

  await protect(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user, user);
});

test('protect rejects a token when its user no longer exists', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;

  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    User.findById = originalFindById;
  });

  process.env.JWT_SECRET = 'test-secret';
  User.findById = async () => null;

  const token = jwt.sign({ id: 'deleted-user' }, 'test-secret');

  const req = {
    headers: {},
    cookies: { token },
  };
  const res = response();

  await protect(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(
    res.payload.message,
    'The user belonging to this token no longer exists.'
  );
});

test('restrictTo allows the matching role', () => {
  const req = { user: { role: 'Organizer' } };
  const res = response();
  let called = false;

  restrictTo('Organizer')(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('restrictTo rejects a different role', () => {
  const req = { user: { role: 'Student' } };
  const res = response();
  let called = false;

  restrictTo('Admin')(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(
    res.payload.message,
    'You do not have permission to perform this action.'
  );
});
