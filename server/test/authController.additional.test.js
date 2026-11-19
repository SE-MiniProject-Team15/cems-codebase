const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { registerUser, loginUser } = require('../controllers/authController');

function response() {
  return {
    statusCode: 200,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    cookie(...args) { this.cookies.push(args); return this; },
  };
}

function invoke(handler, body = {}) {
  const res = response();
  let nextError;
  return Promise.resolve(handler({ body }, res, (error) => { nextError = error; }))
    .then(() => ({ res, nextError }));
}

function restore(t, replacements) {
  for (const [object, key] of replacements) {
    const original = object[key];
    t.after(() => { object[key] = original; });
  }
}

test('registration validates required name, email and password fields', async (t) => {
  restore(t, [[User, 'findOne']]);
  User.findOne = async () => { throw new Error('validation should stop before lookup'); };

  const cases = [
    [{ email: 'a@example.test', password: 'password1' }, 400, /Name is required/],
    [{ name: 'A', password: 'password1' }, 400, /valid email/],
    [{ name: 'A', email: 'a@example.test' }, 400, /Password is required/],
    [{ name: 'A', email: 'a@example.test', password: 'short' }, 400, /at least 8/],
  ];

  for (const [body, status, message] of cases) {
    const { res } = await invoke(registerUser, body);
    assert.equal(res.statusCode, status);
    assert.match(res.payload.message, message);
  }
});

test('registration rejects duplicate email and disallowed roles', async (t) => {
  restore(t, [[User, 'findOne']]);
  User.findOne = async ({ email }) => email === 'taken@example.test' ? { _id: 'existing' } : null;

  let result = await invoke(registerUser, {
    name: 'User', email: ' Taken@Example.Test ', password: 'longpassword',
  });
  assert.equal(result.res.statusCode, 409);

  for (const [role, status, message] of [
    [5, 400, /Role must be/],
    ['admin', 403, /cannot be self-registered/],
    ['moderator', 400, /Role must be/],
  ]) {
    result = await invoke(registerUser, {
      name: 'User', email: 'new@example.test', password: 'longpassword', role,
    });
    assert.equal(result.res.statusCode, status);
    assert.match(result.res.payload.message, message);
  }
});

test('registration creates normalized student and organizer accounts without signing them in', async (t) => {
  restore(t, [[User, 'findOne'], [User, 'create'], [jwt, 'sign']]);
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  process.env.JWT_SECRET = 'test-secret';
  User.findOne = async () => null;
  jwt.sign = (payload, secret, options) => {
    assert.equal(secret, 'test-secret');
    assert.deepEqual(options, { expiresIn: '1d' });
    return `token-${payload.role}`;
  };
  const created = [];
  User.create = async (record) => {
    created.push(record);
    return { _id: String(created.length), ...record };
  };

  for (const [role, expected] of [[undefined, 'Student'], [' Organizer ', 'Organizer'], ['', 'Student']]) {
    const body = { name: '  Test Person ', email: '  PERSON@Example.Test ', password: 'longpassword' };
    if (role !== undefined) body.role = role;
    const { res, nextError } = await invoke(registerUser, body);
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.data.user.role, expected);
    assert.deepEqual(res.payload.data.user, {
      id: String(created.length), name: 'Test Person', email: 'person@example.test', role: expected,
    });
    assert.equal(res.payload.message, 'Registration successful');
    assert.equal(res.cookies.length, 0);
  }
});

test('registration maps duplicate-key and unexpected persistence errors safely', async (t) => {
  restore(t, [[User, 'findOne'], [User, 'create']]);
  User.findOne = async () => null;
  User.create = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };

  let result = await invoke(registerUser, {
    name: 'User', email: 'user@example.test', password: 'longpassword',
  });
  assert.equal(result.res.statusCode, 409);

  const failure = new Error('database unavailable');
  User.create = async () => { throw failure; };
  result = await invoke(registerUser, {
    name: 'User', email: 'user@example.test', password: 'longpassword',
  });
  assert.equal(result.res.statusCode, 500);
  assert.match(result.res.payload.message, /Unable to complete request/);
});

test('login validates credentials, handles unknown users and rejects bad passwords', async (t) => {
  restore(t, [[User, 'findOne']]);
  User.findOne = () => ({ select: async () => null });

  let result = await invoke(loginUser, { email: '', password: 'secret' });
  assert.equal(result.res.statusCode, 400);

  result = await invoke(loginUser, { email: 'missing@example.test', password: 'secret' });
  assert.equal(result.res.statusCode, 401);
  assert.match(result.res.payload.message, /Invalid email or password/);

  const user = {
    _id: 'u1', name: 'User', email: 'user@example.test', role: 'Student',
    loginAttempts: 0, comparePassword: async () => false, async save() {},
  };
  User.findOne = (query) => {
    assert.deepEqual(query, { email: 'user@example.test' });
    return { select: async (field) => {
      assert.equal(field, '+password +loginAttempts +lockUntil');
      return user;
    } };
  };
  result = await invoke(loginUser, { email: ' USER@Example.Test ', password: 'wrong' });
  assert.equal(result.res.statusCode, 401);
});

test('login signs a token, sets the cookie and contains database or crypto errors', async (t) => {
  restore(t, [[User, 'findOne'], [jwt, 'sign']]);
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  process.env.JWT_SECRET = 'test-secret';
  const user = {
    _id: 'u1', name: 'User', email: 'user@example.test', role: 'Organizer',
    loginAttempts: 0, comparePassword: async (password) => password === 'correct',
  };
  User.findOne = () => ({ select: async () => user });
  jwt.sign = (payload) => `token-${payload.id}`;

  const { res, nextError } = await invoke(loginUser, {
    email: 'USER@example.test', password: 'correct',
  });
  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data.user, {
    id: 'u1', name: 'User', email: 'user@example.test', role: 'Organizer',
  });
  assert.equal(res.cookies[0][1], 'token-u1');

  const failure = new Error('query failed');
  User.findOne = () => ({ select: async () => { throw failure; } });
  const failed = await invoke(loginUser, { email: 'user@example.test', password: 'correct' });
  assert.equal(failed.res.statusCode, 500);
  assert.match(failed.res.payload.message, /Unable to complete request/);
});

function lockoutUser(overrides = {}) {
  return {
    _id: 'lockout-user', name: 'Lockout User', email: 'user@example.test', role: 'Student',
    loginAttempts: 0, lockUntil: undefined, saveCalls: 0,
    comparePassword: async () => false,
    async save() { this.saveCalls += 1; },
    ...overrides,
  };
}

async function loginAs(user, password = 'wrong-password') {
  const original = User.findOne;
  User.findOne = () => ({ select: async () => user });
  try {
    return (await invoke(loginUser, { email: 'user@example.test', password })).res;
  } finally {
    User.findOne = original;
  }
}

test('fifth failed login starts a 15-minute lockout', async () => {
  const user = lockoutUser({ loginAttempts: 4 });
  const before = Date.now();
  const res = await loginAs(user);

  assert.equal(res.statusCode, 401);
  assert.equal(user.loginAttempts, 5);
  assert.ok(user.lockUntil instanceof Date);
  assert.ok(user.lockUntil.getTime() >= before + 15 * 60 * 1000);
  assert.equal(user.saveCalls, 1);
});

test('active lockout rejects login without checking the password', async () => {
  let passwordChecked = false;
  const user = lockoutUser({
    loginAttempts: 5,
    lockUntil: new Date(Date.now() + 60_000),
    comparePassword: async () => { passwordChecked = true; return true; },
  });

  const res = await loginAs(user, 'correct-password');
  assert.equal(res.statusCode, 423);
  assert.equal(res.payload.message, 'Account locked, try again later');
  assert.equal(passwordChecked, false);
  assert.equal(user.saveCalls, 0);
});

test('expired lockout resets before a failed password starts a new count', async () => {
  const user = lockoutUser({ loginAttempts: 5, lockUntil: new Date(Date.now() - 1) });
  const res = await loginAs(user);

  assert.equal(res.statusCode, 401);
  assert.equal(user.loginAttempts, 1);
  assert.equal(user.lockUntil, undefined);
  assert.equal(user.saveCalls, 2);
});
