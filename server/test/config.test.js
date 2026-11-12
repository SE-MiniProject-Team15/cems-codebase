const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { getJwtSecret } = require('../config/auth');
const connectDB = require('../config/db');

test('JWT configuration returns the secret and rejects an absent secret', (t) => {
  const original = process.env.JWT_SECRET;
  t.after(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });
  process.env.JWT_SECRET = 'configured-secret';
  assert.equal(getJwtSecret(), 'configured-secret');
  delete process.env.JWT_SECRET;
  assert.throws(getJwtSecret, /JWT_SECRET is not configured/);
});

test('database config validates the URI and delegates connection errors', async (t) => {
  const originalUri = process.env.MONGO_URI;
  const originalConnect = mongoose.connect;
  t.after(() => {
    mongoose.connect = originalConnect;
    if (originalUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = originalUri;
  });

  delete process.env.MONGO_URI;
  await assert.rejects(connectDB(), /MONGO_URI is not configured/);

  process.env.MONGO_URI = 'mongodb://localhost:27017/cems-test';
  const connection = { readyState: 1 };
  mongoose.connect = async (uri) => {
    assert.equal(uri, process.env.MONGO_URI);
    return connection;
  };
  assert.equal(await connectDB(), connection);

  const failure = new Error('connection refused');
  mongoose.connect = async () => { throw failure; };
  await assert.rejects(connectDB(), (error) => error === failure);
});
