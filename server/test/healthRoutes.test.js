const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const mongoose = require('mongoose');

test('GET /api/health reports process and MongoDB health without authentication', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/health`
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.ok(['healthy', 'degraded'].includes(payload.status));
  assert.equal(typeof payload.uptime, 'number');
  assert.ok(payload.uptime >= 0);
  assert.ok(Number.isFinite(Date.parse(payload.timestamp)));
  assert.equal(payload.database.readyState, mongoose.connection.readyState);
  assert.equal(
    payload.status,
    mongoose.connection.readyState === 1 ? 'healthy' : 'degraded'
  );
});
