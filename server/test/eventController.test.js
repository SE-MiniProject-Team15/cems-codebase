const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventAuditLog = require('../models/EventAuditLog');
const Notification = require('../models/Notification');
const {
  createEvent,
  listMyEvents,
  updateEvent,
  cancelEvent,
  approveEvent,
  listPublicEvents,
  listEvents,
  getEvent,
  checkInStudent,
  listAttendance,
  listAttendanceOverview,
  listAdminAuditLogs,
} = require('../controllers/eventController');

const eventId = '507f1f77bcf86cd799439011';
const organizerId = '507f1f77bcf86cd799439012';
const studentId = '507f1f77bcf86cd799439013';
const registrationId = '507f1f77bcf86cd799439014';
const registrationCode = 'a'.repeat(64);

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function call(handler, req = {}) {
  const res = response();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  return { res, nextError };
}

function restore(t, object, keys) {
  for (const key of keys) {
    const original = object[key];
    t.after(() => { object[key] = original; });
  }
}

function details(overrides = {}) {
  const startDateTime = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return {
    title: 'Campus workshop',
    category: 'Workshop',
    description: 'Learn something useful',
    venue: 'Main Hall',
    department: 'Engineering',
    startDateTime,
    endDateTime: new Date(startDateTime.getTime() + 60 * 60 * 1000),
    registrationDeadline: new Date(startDateTime.getTime() - 60 * 60 * 1000),
    capacity: 25,
    bannerUrl: '/workshop.png',
    ...overrides,
  };
}

function event(overrides = {}) {
  const item = {
    _id: eventId,
    organizer: organizerId,
    status: 'Pending Approval',
    ...details(),
    registeredStudents: [],
    registrations: [],
    approvedSnapshot: undefined,
    saves: 0,
    toObject() { return { ...this }; },
    async save() { this.saves += 1; },
    ...overrides,
  };
  return item;
}

test('createEvent rejects invalid details, saves drafts and detects venue conflicts', async (t) => {
  restore(t, Event, ['create', 'exists']);
  Event.create = async (value) => value;
  Event.exists = async () => false;

  let result = await call(createEvent, { body: {}, user: { _id: organizerId } });
  assert.equal(result.res.statusCode, 400);
  assert.match(result.res.payload.message, /title is required/);

  result = await call(createEvent, {
    body: { status: 'Draft', title: 'A draft' }, user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 201);
  assert.equal(result.res.payload.data.event.status, 'Draft');

  Event.exists = async () => true;
  result = await call(createEvent, {
    body: details(), user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 409);

  Event.exists = async () => false;
  result = await call(createEvent, {
    body: details(), user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 201);
  assert.equal(result.res.payload.data.event.status, 'Pending Approval');
  assert.equal(result.res.payload.data.event.organizer, organizerId);
});

test('createEvent forwards persistence failures', async (t) => {
  restore(t, Event, ['create', 'exists']);
  Event.exists = async () => false;
  const failure = new Error('write failed');
  Event.create = async () => { throw failure; };
  const result = await call(createEvent, {
    body: details(), user: { _id: organizerId },
  });
  assert.equal(result.nextError, failure);
});

test('event creation strips executable HTML from stored event text', async (t) => {
  restore(t, Event, ['create', 'exists']);
  Event.exists = async () => false;
  Event.create = async (value) => value;
  const result = await call(createEvent, {
    body: details({
      description: '<img src=x onerror=alert(1)>Useful <script>alert(2)</script> workshop',
    }),
    user: { _id: organizerId },
  });

  assert.equal(result.res.statusCode, 201);
  assert.doesNotMatch(result.res.payload.data.event.description, /<script|onerror|<img/i);
});

test('listMyEvents returns selected events and forwards query errors', async (t) => {
  restore(t, Event, ['find']);
  let query;
  Event.find = (filter) => {
    query = filter;
    return {
      select(fields) {
        assert.match(fields, /status/);
        return {
          sort(order) {
            assert.deepEqual(order, { updatedAt: -1 });
            return { lean: async () => [{ _id: eventId }] };
          },
        };
      },
    };
  };
  let result = await call(listMyEvents, { user: { _id: organizerId } });
  assert.deepEqual(query, { organizer: organizerId });
  assert.deepEqual(result.res.payload.data.events, [{ _id: eventId }]);

  const failure = new Error('query failed');
  Event.find = () => { throw failure; };
  result = await call(listMyEvents, { user: { _id: organizerId } });
  assert.equal(result.nextError, failure);
});

test('updateEvent handles bad IDs, missing and cancelled events', async (t) => {
  restore(t, Event, ['findOne']);
  let result = await call(updateEvent, {
    params: { id: 'bad' }, user: { _id: organizerId }, body: {},
  });
  assert.equal(result.res.statusCode, 400);

  Event.findOne = async () => null;
  result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: {},
  });
  assert.equal(result.res.statusCode, 404);

  Event.findOne = async () => event({ status: 'Cancelled' });
  result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: {},
  });
  assert.equal(result.res.statusCode, 400);
  assert.match(result.res.payload.message, /cannot be edited/);
});

test('updateEvent validates, detects conflicts and reapproves valid updates', async (t) => {
  restore(t, Event, ['findOne', 'exists']);
  const item = event({ status: 'Approved', registeredStudents: [studentId] });
  Event.findOne = async () => item;
  Event.exists = async () => false;

  let result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: { title: '' },
  });
  assert.equal(result.res.statusCode, 400);

  Event.exists = async () => true;
  result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: { title: 'New title' },
  });
  assert.equal(result.res.statusCode, 409);

  Event.exists = async () => false;
  const notificationOriginal = Notification.insertMany;
  t.after(() => { Notification.insertMany = notificationOriginal; });
  const notifications = [];
  Notification.insertMany = async (rows) => { notifications.push(...rows); };
  result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: { title: 'New title' },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(item.status, 'Pending Approval');
  assert.equal(item.approvedSnapshot.title, 'Campus workshop');
  assert.equal(item.title, 'New title');
  assert.equal(notifications[0].type, 'EVENT_UPDATED');
});

test('updateEvent preserves drafts and forwards database errors', async (t) => {
  restore(t, Event, ['findOne', 'exists']);
  const draft = event({ status: 'Draft', title: 'Draft', venue: '' });
  Event.findOne = async () => draft;
  Event.exists = async () => false;
  let result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId },
    body: { status: 'Draft', title: 'Revised draft' },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(draft.status, 'Draft');

  const failure = new Error('read failed');
  Event.findOne = async () => { throw failure; };
  result = await call(updateEvent, {
    params: { id: eventId }, user: { _id: organizerId }, body: {},
  });
  assert.equal(result.nextError, failure);
});

test('cancelEvent covers invalid, missing, repeated and successful cancellation states', async (t) => {
  restore(t, Event, ['findOne']);
  let result = await call(cancelEvent, {
    params: { id: 'bad' }, user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 400);

  Event.findOne = async () => null;
  result = await call(cancelEvent, {
    params: { id: eventId }, user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 404);

  Event.findOne = async () => event({ status: 'Cancelled' });
  result = await call(cancelEvent, {
    params: { id: eventId }, user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 400);

  const item = event({ status: 'Approved', registeredStudents: [studentId] });
  Event.findOne = async () => item;
  const original = Notification.insertMany;
  t.after(() => { Notification.insertMany = original; });
  let savedNotifications = [];
  Notification.insertMany = async (rows) => { savedNotifications = rows; };
  result = await call(cancelEvent, {
    params: { id: eventId }, user: { _id: organizerId },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(item.status, 'Cancelled');
  assert.equal(savedNotifications[0].type, 'EVENT_CANCELLED');

  Event.findOne = async () => event({ status: 'Pending Approval' });
  result = await call(cancelEvent, {
    params: { id: eventId }, user: { _id: organizerId },
  });
  assert.match(result.res.payload.message, /successfully/);
});

test('listPublicEvents returns sanitized approved and previously approved events', async (t) => {
  restore(t, Event, ['find']);
  const publicDetails = details();
  const items = [
    event({ status: 'Approved', registrations: [{ registrationCode }] }),
    event({
      status: 'Pending Approval', title: 'Unpublished',
      approvedSnapshot: { ...publicDetails, title: 'Published title' },
      registeredStudents: [studentId],
    }),
  ];
  Event.find = (filter) => {
    assert.ok(filter.$or);
    return {
      select(fields) { assert.match(fields, /approvedSnapshot/); return this; },
      sort: async () => items,
    };
  };
  const result = await call(listPublicEvents);
  assert.equal(result.res.payload.results, 2);
  assert.equal(result.res.payload.data.events[1].title, 'Published title');
  assert.doesNotMatch(JSON.stringify(result.res.payload), /registrationCode|registeredStudents/);
});

test('listPublicEvents forwards query failures', async (t) => {
  restore(t, Event, ['find']);
  const failure = new Error('query failed');
  Event.find = () => { throw failure; };
  const result = await call(listPublicEvents);
  assert.equal(result.nextError, failure);
});

test('listEvents validates query parameters and constructs filtered pagination', async (t) => {
  restore(t, Event, ['aggregate']);
  const invalidQueries = [
    { q: 'x'.repeat(101) },
    { category: 'x'.repeat(81) },
    { venue: 'x'.repeat(161) },
    { department: 'x'.repeat(121) },
    { dateFrom: 'invalid' },
    { dateTo: 'invalid' },
    { page: '0' },
    { limit: 'nope' },
    { dateFrom: '2026-11-12', dateTo: '2026-11-10' },
    { sort: 'random' },
  ];
  for (const query of invalidQueries) {
    const result = await call(listEvents, { query });
    assert.equal(result.nextError.statusCode, 400, JSON.stringify(query));
  }

  let pipeline;
  Event.aggregate = async (value) => {
    pipeline = value;
    return [{
      events: [{
        _id: eventId, title: 'Campus workshop', category: 'Workshop',
        description: 'Useful', venue: 'Main Hall', department: 'Engineering',
        startDateTime: new Date('2026-12-01T10:00:00Z'),
        endDateTime: new Date('2026-12-01T11:00:00Z'),
        registrationDeadline: new Date('2026-11-30T10:00:00Z'),
        capacity: 10, registrationCount: 4, isRegistered: true,
      }],
      metadata: [{ total: 53 }],
    }];
  };
  const result = await call(listEvents, {
    query: {
      q: 'hall.*', category: 'Workshop', venue: 'Main Hall',
      department: 'Engineering', dateFrom: '2026-11-30',
      dateTo: '2026-12-02', page: '2', limit: '99', sort: 'popular',
    },
    user: { _id: studentId },
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.data.events[0].registrationCount, 4);
  assert.equal(result.res.payload.data.events[0].remainingSeats, 6);
  assert.deepEqual(result.res.payload.data.pagination, {
    page: 2, limit: 50, total: 53, totalPages: 2,
  });
  const escapedSearch = pipeline[2].$match.$or[0].title;
  assert.equal(escapedSearch.test('hall.*'), true);
  assert.equal(escapedSearch.test('hallZZ'), false);
  const dateFilter = pipeline[2].$match.startDateTime;
  assert.ok(dateFilter.$gte instanceof Date);
  assert.equal(dateFilter.$lte.toISOString(), '2026-12-02T23:59:59.999Z');
  const facet = pipeline.at(-1).$facet;
  assert.deepEqual(facet.events[0].$sort, { registrationCount: -1, startDateTime: 1 });
});

test('listEvents applies default upcoming date, empty metadata and catches aggregation errors', async (t) => {
  restore(t, Event, ['aggregate']);
  let pipeline;
  Event.aggregate = async (value) => {
    pipeline = value;
    return [{ events: [], metadata: [] }];
  };
  let result = await call(listEvents, { query: {} });
  assert.equal(result.res.payload.data.pagination.total, 0);
  assert.ok(pipeline[2].$match.startDateTime.$gte instanceof Date);
  assert.equal(result.res.payload.data.events.length, 0);

  Event.aggregate = async () => { throw new Error('aggregate failed'); };
  result = await call(listEvents, { query: {} });
  assert.match(result.nextError.message, /aggregate failed/);
});

test('getEvent validates IDs and serializes an event or returns not found', async (t) => {
  restore(t, Event, ['aggregate']);
  let result = await call(getEvent, {
    params: { eventId: 'bad' }, user: { _id: studentId },
  });
  assert.equal(result.res.statusCode, 404);

  Event.aggregate = async () => [];
  result = await call(getEvent, {
    params: { eventId }, user: { _id: studentId },
  });
  assert.equal(result.res.statusCode, 404);

  Event.aggregate = async () => [{
    _id: eventId, ...details(), registrationCount: 2,
    isRegistered: true, registeredStudents: [studentId],
  }];
  result = await call(getEvent, {
    params: { eventId }, user: { _id: studentId },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.data.event.isRegistered, true);
  assert.equal(result.res.payload.data.event.remainingSeats, 23);
});

test('checkInStudent validates ticket, owner, event state and check-in time', async (t) => {
  restore(t, Event, ['findById', 'updateOne']);
  const request = (code) => ({
    params: { eventId }, user: { _id: organizerId }, body: { code },
  });

  let result = await call(checkInStudent, {
    ...request('bad'), params: { eventId: 'bad' },
  });
  assert.equal(result.res.statusCode, 404);
  result = await call(checkInStudent, request('bad'));
  assert.equal(result.res.statusCode, 400);
  const wrongEventTicket = `CEMS-REGISTRATION:507f1f77bcf86cd799439099:${registrationId}:${registrationCode}`;
  result = await call(checkInStudent, request(wrongEventTicket));
  assert.equal(result.res.statusCode, 400);

  const ticket = `CEMS-REGISTRATION:${eventId}:${registrationId}:${registrationCode}`;
  Event.findById = () => ({
    populate() { return this; },
    then(resolve) { resolve(null); },
  });
  result = await call(checkInStudent, request(ticket));
  assert.equal(result.res.statusCode, 404);

  Event.findById = async () => event({ organizer: studentId });
  result = await call(checkInStudent, request(ticket));
  assert.equal(result.res.statusCode, 403);

  Event.findById = async () => event({ status: 'Cancelled' });
  result = await call(checkInStudent, request(ticket));
  assert.equal(result.res.statusCode, 409);

  Event.findById = async () => event({
    status: 'Approved', startDateTime: new Date(Date.now() + 60_000),
  });
  result = await call(checkInStudent, request(ticket));
  assert.equal(result.res.statusCode, 409);
});

test('checkInStudent rejects missing, ineligible and previously checked-in tickets', async (t) => {
  restore(t, Event, ['findById']);
  const ticket = `CEMS-REGISTRATION:${eventId}:${registrationId}:${registrationCode}`;
  const request = { params: { eventId }, user: { _id: organizerId }, body: { code: ticket } };
  const item = event({
    status: 'Approved',
    startDateTime: new Date(Date.now() - 30_000),
    endDateTime: new Date(Date.now() + 30_000),
    registrations: { id: () => null },
  });
  Event.findById = async () => item;
  let result = await call(checkInStudent, request);
  assert.equal(result.res.statusCode, 404);

  item.registrations.id = () => ({ status: 'Waitlisted' });
  result = await call(checkInStudent, request);
  assert.equal(result.res.statusCode, 404);

  item.registrations.id = () => ({ status: 'Registered', attendedAt: new Date(), student: studentId });
  result = await call(checkInStudent, request);
  assert.equal(result.res.statusCode, 409);
});

test('checkInStudent atomically records attendance once', async (t) => {
  restore(t, Event, ['findById', 'updateOne']);
  restore(t, EventAuditLog, ['create']);
  EventAuditLog.create = async (record) => record;
  const registration = { status: 'Registered', student: studentId, attendedAt: null };
  const item = event({
    status: 'Approved',
    startDateTime: new Date(Date.now() - 30_000),
    endDateTime: new Date(Date.now() + 30_000),
    registrations: { id: (id) => String(id) === registrationId ? registration : null },
  });
  Event.findById = async () => item;
  let filter;
  Event.updateOne = async (query, update) => {
    filter = query;
    assert.equal(update.$set['registrations.$.checkedInBy'], organizerId);
    return { modifiedCount: 1 };
  };
  const result = await call(checkInStudent, {
    params: { eventId }, user: { _id: organizerId },
    body: { code: `CEMS-REGISTRATION:${eventId}:${registrationId}:${registrationCode}` },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.data.studentId, studentId);
  assert.equal(filter.registrations.$elemMatch.registrationCode, registrationCode);

  Event.updateOne = async () => ({ modifiedCount: 0 });
  const failed = await call(checkInStudent, {
    params: { eventId }, user: { _id: organizerId },
    body: { code: `CEMS-REGISTRATION:${eventId}:${registrationId}:${registrationCode}` },
  });
  assert.equal(failed.res.statusCode, 409);
});

test('listAttendance restricts organizers and returns registered students only', async (t) => {
  restore(t, Event, ['findById']);
  let result = await call(listAttendance, {
    params: { eventId: 'bad' }, user: { _id: organizerId, role: 'Organizer' },
  });
  assert.equal(result.res.statusCode, 404);

  Event.findById = () => ({
    populate() { return this; },
    then(resolve) { resolve(null); },
  });
  result = await call(listAttendance, {
    params: { eventId }, user: { _id: organizerId, role: 'Organizer' },
  });
  assert.equal(result.res.statusCode, 404);

  const registered = {
    status: 'Registered', student: { _id: studentId, name: 'Student', email: 'student@example.test' },
    createdAt: new Date(), attendedAt: null, checkedInBy: null,
  };
  const item = event({
    status: 'Approved',
    registrations: [registered, { status: 'Waitlisted', student: studentId }],
  });
  Event.findById = () => ({
    populate() { return this; },
    then(resolve) { resolve(item); },
  });
  result = await call(listAttendance, {
    params: { eventId }, user: { _id: studentId, role: 'Organizer' },
  });
  assert.equal(result.res.statusCode, 403);

  result = await call(listAttendance, {
    params: { eventId }, user: { _id: organizerId, role: 'Organizer' },
  });
  assert.equal(result.res.payload.data.event.registeredCount, 1);
  assert.equal(result.res.payload.data.registrations[0].name, 'Student');

  result = await call(listAttendance, {
    params: { eventId }, user: { _id: studentId, role: 'Admin' },
  });
  assert.equal(result.res.statusCode, 200);
});

test('listAttendanceOverview summarizes events and forwards query errors', async (t) => {
  restore(t, Event, ['find']);
  const item = event({
    registeredStudents: [studentId],
    registrations: [
      { status: 'Registered', attendedAt: new Date() },
      { status: 'Waitlisted', attendedAt: new Date() },
    ],
  });

  test('Admin audit endpoint returns actor, action, target and timestamp entries', async (t) => {
    restore(t, EventAuditLog, ['find']);
    const record = {
      actor: { name: 'Admin' },
      action: 'APPROVE',
      targetType: 'Event',
      targetId: eventId,
      timestamp: new Date(),
    };
    EventAuditLog.find = () => ({
      sort() { return this; },
      limit(count) { assert.equal(count, 500); return this; },
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve([record]).then(resolve, reject); },
    });

    const result = await call(listAdminAuditLogs);
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.res.payload.data.auditLogs[0].actor.name, 'Admin');
    assert.equal(result.res.payload.data.auditLogs[0].action, 'APPROVE');
    assert.equal(result.res.payload.data.auditLogs[0].timestamp instanceof Date, true);
  });
  Event.find = () => ({
    sort() { return this; },
    select(fields) {
      assert.match(fields, /registrations/);
      return Promise.resolve([item]);
    },
  });
  let result = await call(listAttendanceOverview);
  assert.equal(result.res.payload.data.events[0].registeredCount, 1);
  assert.equal(result.res.payload.data.events[0].attendedCount, 1);

  const failure = new Error('overview unavailable');
  Event.find = () => { throw failure; };
  result = await call(listAttendanceOverview);
  assert.equal(result.nextError, failure);
});
