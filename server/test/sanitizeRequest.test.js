const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sanitizeRequest = require('../middleware/sanitizeRequest');

test('request sanitizer strips NoSQL and dotted keys from body and query objects', async (t) => {
  const app = express();
  app.use(express.json());
  app.use(sanitizeRequest);
  app.all('/echo', (req, res) => res.json({ body: req.body, query: req.query }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/echo?safe=yes&%24where=bad&profile.name=bad`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: { $ne: '' },
        profile: { 'first.name': 'bad', safe: 'kept' },
      }),
    }
  );
  const result = await response.json();

  assert.deepEqual(result.body, { email: {}, profile: { safe: 'kept' } });
  assert.deepEqual(result.query, { safe: 'yes' });
});
