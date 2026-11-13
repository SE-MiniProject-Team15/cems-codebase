
const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../models/User');
const { registerUser, loginUser } = require('../controllers/authController');

function mockResponse() {
  return {
    statusCode: 200,
    payload: null,
    cookieName: null,
    cookieValue: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(payload) {
      this.payload = payload;
      return this;
    },

    cookie(name, value) {
      this.cookieName = name;
      this.cookieValue = value;
      return this;
    },
  };
}

test('registration rejects a missing name', async () => {
  const res = mockResponse();

  await registerUser({ body: { email: 'test@example.com', password: 'Password123' } }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'Name is required');
});

test('registration rejects a missing email', async () => {
  const res = mockResponse();

  await registerUser({ body: { name: 'Test User', password: 'Password123' } }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'A valid email address is required');
});

test('registration rejects a missing password', async () => {
  const res = mockResponse();

  await registerUser({ body: { name: 'Test User', email: 'test@example.com' } }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'Password is required');
});

test('registration rejects passwords shorter than 8 characters', async () => {
  const res = mockResponse();

  await registerUser({
    body: { name: 'Test User', email: 'test@example.com', password: 'short' },
  }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'Password must be at least 8 characters');
});

test('registration prevents users from self-registering as Admin', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  User.findOne = async () => null;

  const res = mockResponse();

  await registerUser({
    body: {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
      role: 'Admin',
    },
  }, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'Administrator accounts cannot be self-registered');
});

test('registration rejects an already registered email', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  User.findOne = async () => ({ email: 'test@example.com' });

  const res = mockResponse();

  await registerUser({
    body: {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
    },
  }, res, () => {});

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.message, 'Email already registered');
});

test('login rejects missing email or password', async () => {
  const res = mockResponse();

  await loginUser({ body: { email: 'test@example.com' } }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'Email and password are required');
});

test('login rejects an email that does not exist', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  User.findOne = () => ({
    select: async () => null,
  });

  const res = mockResponse();

  await loginUser({
    body: { email: 'missing@example.com', password: 'Password123' },
  }, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.message, 'Invalid email or password');
});

const bcrypt = require('bcryptjs');

test('registration successfully creates a Student account', async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalSecret = process.env.JWT_SECRET;

  t.after(() => {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
  User.findOne = async () => null;
  User.create = async (data) => ({
    _id: 'test-user-1',
    name: data.name,
    email: data.email,
    role: data.role,
  });

  const res = mockResponse();

  await registerUser({
    body: {
      name: ' Test User ',
      email: ' TEST@example.com ',
      password: 'Password123',
    },
  }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.status, 'success');
  assert.equal(res.payload.data.user.role, 'Student');
  assert.equal(res.payload.data.user.email, 'test@example.com');
  assert.equal(res.cookieName, 'token');
  assert.ok(res.cookieValue);
});

test('login successfully authenticates a user', async (t) => {
  const originalFindOne = User.findOne;
  const originalSecret = process.env.JWT_SECRET;

  t.after(() => {
    User.findOne = originalFindOne;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
  const hashedPassword = await bcrypt.hash('Password123', 4);

  User.findOne = () => ({
    select: async () => ({
      _id: 'test-user-2',
      name: 'Test User',
      email: 'test@example.com',
      role: 'Student',
      password: hashedPassword,
    }),
  });

  const res = mockResponse();

  await loginUser({
    body: { email: 'TEST@example.com', password: 'Password123' },
  }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'success');
  assert.equal(res.payload.data.user.email, 'test@example.com');
  assert.equal(res.cookieName, 'token');
  assert.ok(res.cookieValue);
});

test('login rejects an incorrect password', async (t) => {
  const originalFindOne = User.findOne;

  t.after(() => {
    User.findOne = originalFindOne;
  });

  const hashedPassword = await bcrypt.hash('Password123', 4);

  User.findOne = () => ({
    select: async () => ({
      _id: 'test-user-3',
      email: 'test@example.com',
      role: 'Student',
      password: hashedPassword,
    }),
  });

  const res = mockResponse();

  await loginUser({
    body: { email: 'test@example.com', password: 'WrongPassword123' },
  }, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.message, 'Invalid email or password');
});
