const test = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../models/Notification');
const router = require('../routes/notificationRoutes');
const { protect } = require('../middleware/authMiddleware');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function routeHandler(path, method) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])
    ?.route.stack.at(-1).handle;
}

test('notification routes require authentication and query only the current recipient', () => {
  assert.equal(router.stack[0].handle, protect);
  assert.equal(routeHandler('/', 'get') instanceof Function, true);
  assert.equal(routeHandler('/:id/read', 'patch') instanceof Function, true);
});

test('GET notifications returns the current user’s notifications newest first', async (t) => {
  const original = Notification.find;
  t.after(() => { Notification.find = original; });
  const userId = 'user-1';
  const notices = [{ _id: 'n1' }];
  let filter;
  Notification.find = (query) => {
    filter = query;
    return { sort: async (order) => {
      assert.deepEqual(order, { createdAt: -1, _id: -1 });
      return notices;
    } };
  };
  const res = response();
  await routeHandler('/', 'get')({ user: { _id: userId } }, res, (error) => { throw error; });
  assert.deepEqual(filter, { recipient: userId });
  assert.deepEqual(res.payload.data.notifications, notices);
});

test('GET notifications forwards database errors', async (t) => {
  const original = Notification.find;
  t.after(() => { Notification.find = original; });
  const failure = new Error('read failed');
  Notification.find = () => ({ sort: async () => { throw failure; } });
  const res = response();
  let nextError;
  await routeHandler('/', 'get')({ user: { _id: 'user-1' } }, res, (error) => { nextError = error; });
  assert.equal(nextError, failure);
});

test('PATCH notification read scopes updates to the current recipient', async (t) => {
  const original = Notification.findOneAndUpdate;
  t.after(() => { Notification.findOneAndUpdate = original; });
  const notice = { _id: 'notice-1', read: true };
  let args;
  Notification.findOneAndUpdate = async (...input) => { args = input; return notice; };
  const res = response();
  await routeHandler('/:id/read', 'patch')({
    params: { id: '507f1f77bcf86cd799439011' }, user: { _id: 'user-1' },
  }, res, (error) => { throw error; });
  assert.deepEqual(args, [
    { _id: '507f1f77bcf86cd799439011', recipient: 'user-1' },
    { read: true },
    { returnDocument: 'after' },
  ]);
  assert.equal(res.payload.data.notification, notice);
});

test('PATCH notification read rejects malformed IDs before querying', async (t) => {
  const original = Notification.findOneAndUpdate;
  t.after(() => { Notification.findOneAndUpdate = original; });
  let queried = false;
  Notification.findOneAndUpdate = async () => { queried = true; };

  const res = response();
  await routeHandler('/:id/read', 'patch')({
    params: { id: 'not-an-object-id' }, user: { _id: 'user-1' },
  }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('PATCH notification read returns 404 when absent and forwards storage failures', async (t) => {
  const original = Notification.findOneAndUpdate;
  t.after(() => { Notification.findOneAndUpdate = original; });
  Notification.findOneAndUpdate = async () => null;
  let res = response();
  await routeHandler('/:id/read', 'patch')({ params: { id: '507f1f77bcf86cd799439012' }, user: { _id: 'user-1' } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 404);

  const failure = new Error('write failed');
  Notification.findOneAndUpdate = async () => { throw failure; };
  res = response();
  let nextError;
  await routeHandler('/:id/read', 'patch')({ params: { id: '507f1f77bcf86cd799439011' }, user: { _id: 'user-1' } }, res, (error) => { nextError = error; });
  assert.equal(nextError, failure);
});
