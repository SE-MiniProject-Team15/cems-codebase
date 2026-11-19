const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const checkInRateLimit = require('../middleware/checkInRateLimit');

test('check-in rate limiter throttles the eleventh request in its window', async (t) => {
  const app = express();
  app.post('/check-in', checkInRateLimit, (req, res) => res.json({ status: 'success' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const url = `http://127.0.0.1:${server.address().port}/check-in`;
  const responses = await Promise.all(
    Array.from({ length: 11 }, () => fetch(url, { method: 'POST' }))
  );
  assert.equal(responses.filter((response) => response.status === 200).length, 10);
  const throttled = responses.find((response) => response.status === 429);
  assert.ok(throttled);
  assert.match((await throttled.json()).message, /too many check-in attempts/i);
});

