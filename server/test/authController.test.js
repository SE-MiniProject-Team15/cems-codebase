const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { registerUser, loginUser } = require('../controllers/authController');

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
    cookie(name, value, options) {
      this.cookieValue = value;
      this.cookieName = name;
      this.cookieOptions = options;
      return this;
    },
  };
}

function setEnvironment(t, name, value) {
  const original = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  });
}

test('registration creates a user response without returning the password', async (t) => {
  const originals = {
    findOne: User.findOne,
    create: User.create,
  };
  const user = {
    _id: 'student-id',
    name: 'Test Student',
    email: 'student@example.edu',
    role: 'Student',
    password: 'Pass@1234',
  };
  const secret = 'local-test-jwt-secret';
  setEnvironment(t, 'JWT_SECRET', secret);
  User.findOne = async () => null;
  User.create = async () => user;
  t.after(() => {
    User.findOne = originals.findOne;
    User.create = originals.create;
  });
  const res = response();

  await registerUser({
    body: {
      name: user.name,
      email: user.email,
      password: user.password,
    },
  }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.payload.data.user, {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  assert.doesNotMatch(JSON.stringify(res.payload), /Pass@1234|password/i);
  assert.equal(res.cookieName, 'token');
  assert.equal(jwt.verify(res.cookieValue, secret).id, user._id);
});

test('registration rejects duplicate email and self-registration as Admin', async (t) => {
  const originalFindOne = User.findOne;
  const existingUser = { _id: 'existing-id' };
  User.findOne = async ({ email }) => (
    email === 'existing@example.edu' ? existingUser : null
  );
  t.after(() => {
    User.findOne = originalFindOne;
  });

  const duplicate = response();
  await registerUser({
    body: {
      name: 'Existing Student',
      email: 'existing@example.edu',
      password: 'Pass@1234',
    },
  }, duplicate, (error) => {
    throw error;
  });

  const admin = response();
  await registerUser({
    body: {
      name: 'Admin Applicant',
      email: 'admin@example.edu',
      password: 'Pass@1234',
      role: 'ADMIN',
    },
  }, admin, (error) => {
    throw error;
  });

  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.payload.message, 'Email already registered');
  assert.equal(admin.statusCode, 403);
});

test('registration rejects a NoSQL operator object as an email', async (t) => {
  const originalFindOne = User.findOne;
  User.findOne = () => {
    throw new Error('database lookup should not run');
  };
  t.after(() => {
    User.findOne = originalFindOne;
  });
  const res = response();

  await registerUser({
    body: {
      name: 'Test Student',
      email: { $ne: '' },
      password: 'Pass@1234',
    },
  }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 400);
});

test('successful login issues a verified JWT cookie with secure session flags', async (t) => {
  const originals = {
    findOne: User.findOne,
    compare: bcrypt.compare,
  };
  const user = {
    _id: 'student-id',
    name: 'Test Student',
    email: 'student@example.edu',
    role: 'Student',
    password: 'stored-hash',
    loginAttempts: 0,
    comparePassword(candidate) { return bcrypt.compare(candidate, this.password); },
    async save() {},
  };
  const secret = 'local-test-jwt-secret';
  setEnvironment(t, 'JWT_SECRET', secret);
  setEnvironment(t, 'NODE_ENV', 'production');
  User.findOne = () => ({ select: async () => user });
  bcrypt.compare = async () => true;
  t.after(() => {
    User.findOne = originals.findOne;
    bcrypt.compare = originals.compare;
  });
  const res = response();

  await loginUser({
    body: { email: user.email, password: 'Pass@1234' },
  }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.cookieOptions.httpOnly, true);
  assert.equal(res.cookieOptions.secure, true);
  assert.equal(res.cookieOptions.sameSite, 'strict');
  assert.equal(jwt.verify(res.cookieValue, secret).id, user._id);
  assert.doesNotMatch(JSON.stringify(res.payload), /password|stored-hash/i);
});

test('login uses the same generic response for unknown users and wrong passwords', async (t) => {
  const originals = {
    findOne: User.findOne,
    compare: bcrypt.compare,
  };
  const user = {
    _id: 'student-id',
    password: 'stored-hash',
    loginAttempts: 0,
    comparePassword(candidate) { return bcrypt.compare(candidate, this.password); },
    async save() {},
  };
  User.findOne = (filter) => ({
    select: async () => (
      filter.email === 'known@example.edu' ? user : null
    ),
  });
  bcrypt.compare = async () => false;
  t.after(() => {
    User.findOne = originals.findOne;
    bcrypt.compare = originals.compare;
  });

  const known = response();
  await loginUser({
    body: { email: 'known@example.edu', password: 'wrong-password' },
  }, known, (error) => {
    throw error;
  });

  const unknown = response();
  await loginUser({
    body: { email: 'unknown@example.edu', password: 'wrong-password' },
  }, unknown, (error) => {
    throw error;
  });

  assert.equal(known.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.equal(known.payload.message, unknown.payload.message);
});
