// Run against an isolated checkout of PR #6 or #7. No database is needed.
// node docs/reviews/reproduce-public-registration-leak.cjs /tmp/cems-review-fr05
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');

async function main() {
  const root = path.resolve(process.argv[2]);
  const branchRequire = createRequire(path.join(root, 'server/package.json'));
  const express = branchRequire('express');
  const mongoose = branchRequire('mongoose');
  const Event = branchRequire('./models/Event');
  const routes = branchRequire('./routes/eventRoutes');
  const student = new mongoose.Types.ObjectId();
  // Registration codes are deliberately omitted: they are excluded by default.
  const event = new Event({ title: 'Public event', status: 'Approved',
    registrations: [{ student, status: 'Registered', attendanceStatus: 'Present' }],
  });
  const originalFind = Event.find;
  Event.find = () => ({ select: () => ({ sort: async () => [event] }) });
  const app = express();
  app.use('/api/events', routes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/events/public`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    const published = payload.data.events[0];
    for (const field of ['registrations', 'registeredStudents', 'attendanceStatus']) {
      assert.equal(published[field], undefined);
    }
    console.log(JSON.stringify({ checkout: root, unauthenticatedStatus: response.status,
      privateRegistrationDataOmitted: true }, null, 2));
  } finally {
    Event.find = originalFind;
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
