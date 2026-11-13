const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');

function makeUser(overrides = {}) {
  return new User({
    name: 'Test Student',
    email: 'student@example.edu',
    password: 'Pass@1234',
    ...overrides,
  });
}

test('the user model rejects malformed email and passwords outside policy', async () => {
  for (const user of [
    makeUser({ email: 'not-an-email' }),
    makeUser({ password: 'abc' }),
    makeUser({ password: 'abcdefgh' }),
    makeUser({ password: '12345678' }),
  ]) {
    await assert.rejects(user.validate());
  }

  await assert.doesNotReject(makeUser().validate());
});

test('password fields are excluded from default user queries', () => {
  assert.equal(User.schema.path('password').options.select, false);
});

test('the user model stores a bcrypt hash instead of the submitted password', async (t) => {
  const originalInsertOne = User.collection.insertOne;
  let storedPassword;

  User.collection.insertOne = async (document) => {
    storedPassword = document.password;
    return { acknowledged: true, insertedId: document._id };
  };
  t.after(() => {
    User.collection.insertOne = originalInsertOne;
  });

  await makeUser().save();

  assert.match(storedPassword, /^\$2[aby]\$/);
  assert.notEqual(storedPassword, 'Pass@1234');
});
