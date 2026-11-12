const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Event');

const envKeys = ['MONGO_URI', 'JWT_SECRET', 'NODE_ENV', 'CLIENT_URL'];

function preserveEnvironment(t) {
  const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    set() { return this; },
  };
}

async function withServer(t, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return run(`http://127.0.0.1:${server.address().port}`);
}

test('environment validation requires database and JWT values and HTTPS in production', (t) => {
  preserveEnvironment(t);
  const { validateEnvironment } = app;
  delete process.env.MONGO_URI;
  delete process.env.JWT_SECRET;
  assert.throws(validateEnvironment, /MONGO_URI, JWT_SECRET/);

  process.env.MONGO_URI = 'mongodb://localhost:27017/cems';
  process.env.JWT_SECRET = 'secret';
  process.env.NODE_ENV = 'development';
  delete process.env.CLIENT_URL;
  assert.doesNotThrow(validateEnvironment);

  process.env.NODE_ENV = 'production';
  process.env.CLIENT_URL = 'http://localhost:5173';
  assert.throws(validateEnvironment, /CLIENT_URL must use HTTPS/);
  process.env.CLIENT_URL = 'https://cems.example.test';
  assert.doesNotThrow(validateEnvironment);
});

test('production middleware requires HTTPS and sets security headers', async (t) => {
  preserveEnvironment(t);
  const previousProxy = app.get('trust proxy');
  t.after(() => app.set('trust proxy', previousProxy));
  app.set('trust proxy', true);
  process.env.NODE_ENV = 'production';

  await withServer(t, async (base) => {
    const httpResponse = await fetch(`${base}/api/health`);
    assert.equal(httpResponse.status, 400);
    assert.equal((await httpResponse.json()).message, 'HTTPS is required');
    assert.equal(httpResponse.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(httpResponse.headers.get('x-frame-options'), 'DENY');
    assert.equal(httpResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(httpResponse.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(httpResponse.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');

    const httpsResponse = await fetch(`${base}/api/health`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(httpsResponse.status, 200);
    assert.equal(httpsResponse.headers.get('x-powered-by'), null);
  });
});

test('central error handler preserves client errors and hides internal errors', async (t) => {
  preserveEnvironment(t);
  const originals = {
    verify: jwt.verify,
    findById: User.findById,
    aggregate: Event.aggregate,
    trustProxy: app.get('trust proxy'),
    log: console.error,
  };
  t.after(() => {
    jwt.verify = originals.verify;
    User.findById = originals.findById;
    Event.aggregate = originals.aggregate;
    app.set('trust proxy', originals.trustProxy);
    console.error = originals.log;
  });

  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'test-secret';
  app.set('trust proxy', false);
  jwt.verify = () => ({ id: 'student-1' });
  User.findById = async () => ({ _id: 'student-1', role: 'Student' });
  const logged = [];
  console.error = (...args) => logged.push(args);

  await withServer(t, async (base) => {
    Event.aggregate = async () => {
      throw Object.assign(new Error('Invalid query'), { statusCode: 422 });
    };
    let result = await fetch(`${base}/api/events`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.equal(result.status, 422);
    assert.equal((await result.json()).message, 'Invalid query');
    assert.equal(logged.length, 0);

    Event.aggregate = async () => { throw new Error('database secret'); };
    result = await fetch(`${base}/api/events`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    assert.equal(result.status, 500);
    assert.equal((await result.json()).message, 'Internal server error');
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1], 'Error');
  });
});
