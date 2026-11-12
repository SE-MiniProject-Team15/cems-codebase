const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(req) {
  const res = response();
  let nextError;
  let nextCalls = 0;
  await protect(req, res, (error) => { nextError = error; nextCalls += 1; });
  return { req, res, nextError, nextCalls };
}

function restore(t, object, key) {
  const original = object[key];
  t.after(() => { object[key] = original; });
}

test('protect rejects missing and malformed bearer tokens', async () => {
  let result = await invoke({ headers: {}, cookies: {} });
  assert.equal(result.res.statusCode, 401);

  result = await invoke({ headers: { authorization: 'Basic abc' }, cookies: {} });
  assert.equal(result.res.statusCode, 401);
});

test('protect accepts bearer and cookie tokens and loads the account', async (t) => {
  restore(t, jwt, 'verify');
  restore(t, User, 'findById');
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  process.env.JWT_SECRET = 'middleware-secret';
  let verifiedToken;
  jwt.verify = (token, secret) => {
    verifiedToken = token;
    assert.equal(secret, 'middleware-secret');
    return { id: 'user-1' };
  };
  const user = { _id: 'user-1', role: 'Student' };
  User.findById = async (id) => { assert.equal(id, 'user-1'); return user; };

  let result = await invoke({ headers: { authorization: 'bEaReR token-value' }, cookies: {} });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.user, user);
  assert.equal(verifiedToken, 'token-value');

  result = await invoke({
    headers: { authorization: 'Bearer ignored' }, cookies: { token: 'cookie-value' },
  });
  assert.equal(result.nextCalls, 1);
  assert.equal(verifiedToken, 'cookie-value');
});

test('protect rejects removed users and invalid tokens', async (t) => {
  restore(t, jwt, 'verify');
  restore(t, User, 'findById');
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  process.env.JWT_SECRET = 'middleware-secret';

  jwt.verify = () => ({ id: 'deleted-user' });
  User.findById = async () => null;
  let result = await invoke({ headers: { authorization: 'Bearer token' }, cookies: {} });
  assert.equal(result.res.statusCode, 401);
  assert.match(result.res.payload.message, /no longer exists/);

  jwt.verify = () => { throw new jwt.JsonWebTokenError('bad signature'); };
  result = await invoke({ headers: { authorization: 'Bearer bad' }, cookies: {} });
  assert.equal(result.res.statusCode, 401);
  assert.match(result.res.payload.message, /Invalid or expired/);
});

test('protect forwards database failures to the error handler', async (t) => {
  restore(t, jwt, 'verify');
  restore(t, User, 'findById');
  process.env.JWT_SECRET = 'middleware-secret';
  jwt.verify = () => ({ id: 'user-1' });
  const failure = new Error('database unavailable');
  User.findById = async () => { throw failure; };
  const result = await invoke({ headers: { authorization: 'Bearer valid' }, cookies: {} });
  assert.equal(result.nextError, failure);
  assert.equal(result.nextCalls, 1);
});

test('protect handles missing JWT configuration as an invalid token', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  delete process.env.JWT_SECRET;
  const result = await invoke({ headers: { authorization: 'Bearer token' }, cookies: {} });
  assert.equal(result.res.statusCode, 401);
  assert.match(result.res.payload.message, /Invalid or expired/);
});
