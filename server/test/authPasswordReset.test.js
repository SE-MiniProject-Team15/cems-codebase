const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { forgotPassword, resetPassword } = require('../controllers/authController');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res, (error) => { throw error; });
  return res;
}

test('forgot-password returns the same generic response for known and unknown emails', async (t) => {
  const originals = {
    findOne: User.findOne,
    smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].map((key) => [key, process.env[key]]),
    warn: console.warn,
  };
  t.after(() => {
    User.findOne = originals.findOne;
    console.warn = originals.warn;
    for (const [key, value] of originals.smtp) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const [key] of originals.smtp) delete process.env[key];
  console.warn = () => {};

  const account = {
    resetPasswordToken: undefined,
    resetPasswordExpires: undefined,
    async save() {},
  };
  User.findOne = async ({ email }) => email === 'known@example.test' ? account : null;

  const known = await invoke(forgotPassword, { body: { email: 'known@example.test' } });
  const unknown = await invoke(forgotPassword, { body: { email: 'unknown@example.test' } });

  assert.equal(known.statusCode, 200);
  assert.deepEqual(known.payload, unknown.payload);
  assert.equal(known.payload.message, 'If an account exists for that email, a password reset link has been sent.');
  assert.match(account.resetPasswordToken, /^[a-f0-9]{64}$/);
  assert.ok(account.resetPasswordExpires.getTime() > Date.now() + 29 * 60 * 1000);
  assert.ok(account.resetPasswordExpires.getTime() <= Date.now() + 30 * 60 * 1000);
});

test('reset-password atomically consumes a valid token and rejects reuse', async (t) => {
  const original = User.findOneAndUpdate;
  t.after(() => { User.findOneAndUpdate = original; });
  const token = 'b'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let callCount = 0;
  let filter;
  let update;
  User.findOneAndUpdate = async (query, changes, options) => {
    filter = query;
    update = changes;
    assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
    callCount += 1;
    return callCount === 1 ? { _id: 'account-id' } : null;
  };

  const first = await invoke(resetPassword, {
    params: { token },
    body: { password: 'NewPassword123' },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(filter.resetPasswordToken, tokenHash);
  assert.ok(filter.resetPasswordExpires.$gt instanceof Date);
  assert.equal(update.$unset.resetPasswordToken, 1);
  assert.equal(update.$unset.resetPasswordExpires, 1);
  assert.equal(await bcrypt.compare('NewPassword123', update.$set.password), true);

  const reused = await invoke(resetPassword, {
    params: { token },
    body: { password: 'AnotherPassword123' },
  });
  assert.equal(reused.statusCode, 400);
});
