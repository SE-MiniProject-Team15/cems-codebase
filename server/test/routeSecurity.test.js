const test = require('node:test');
const assert = require('node:assert/strict');
const eventRoutes = require('../routes/eventRoutes');

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
  };
}

function routeMiddleware(path, method) {
  const route = eventRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} should be registered`);
  return route.stack[0].handle;
}

function invoke(middleware, role) {
  const res = response();
  let nextCalled = false;
  middleware({ user: { role } }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test('event creation, approval, check-in, and attendance routes enforce roles', () => {
  const roleGates = [
    { path: '/', method: 'post', allowed: 'Organizer', denied: 'Student' },
    { path: '/:id/approve', method: 'patch', allowed: 'Admin', denied: 'Student' },
    { path: '/admin/audit-logs', method: 'get', allowed: 'Admin', denied: 'Student' },
    {
      path: '/:eventId/attendance/check-in',
      method: 'post',
      allowed: 'Organizer',
      denied: 'Student',
    },
    {
      path: '/:eventId/attendance',
      method: 'get',
      allowed: 'Admin',
      denied: 'Student',
    },
  ];

  for (const { path, method, allowed, denied } of roleGates) {
    const middleware = routeMiddleware(path, method);
    const accepted = invoke(middleware, allowed);
    const rejected = invoke(middleware, denied);

    assert.equal(accepted.nextCalled, true, `${allowed} should pass ${path}`);
    assert.equal(rejected.nextCalled, false, `${denied} should not pass ${path}`);
    assert.equal(rejected.res.statusCode, 403);
  }
});

test('unexpected server errors return a generic message without internal details', (t) => {
  const { handleError } = require('../server');
  const res = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalConsoleError;
  });

  handleError(
    new Error('internal stack detail'),
    {},
    res,
    () => {}
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, {
    status: 'error',
    message: 'Internal server error',
  });
  assert.doesNotMatch(JSON.stringify(res.payload), /internal stack detail/i);
});
