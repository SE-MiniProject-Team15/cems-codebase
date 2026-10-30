const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const eventRoutes = require('../routes/eventRoutes');
const registrationRoutes = require('../routes/registrationRoutes');
const {
  registerForEvent,
  cancelRegistration,
  listMyRegistrations,
} = require('../controllers/registrationController');

const eventId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const otherStudentId = new mongoose.Types.ObjectId();

function makeRegistration(student, status, createdAt = new Date()) {
  return {
    _id: new mongoose.Types.ObjectId(),
    student,
    status,
    createdAt,
  };
}

function makeEvent(overrides = {}) {
  const event = {
    _id: eventId,
    title: 'CEMS Workshop',
    category: 'Workshop',
    status: 'Approved',
    registrationDeadline: new Date(Date.now() + 60 * 60 * 1000),
    startDateTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
    capacity: 1,
    venue: 'Main Hall',
    registeredStudents: [],
    registrations: [],
    approvedSnapshot: undefined,
    saveCalls: 0,
    toObject() {
      return this;
    },
    async save() {
      this.saveCalls += 1;
    },
    ...overrides,
  };

  event.registeredStudents.addToSet = function addToSet(id) {
    if (!this.some((registeredId) => String(registeredId) === String(id))) {
      this.push(id);
    }
  };
  event.registeredStudents.pull = function pull(id) {
    const index = this.findIndex((registeredId) => String(registeredId) === String(id));
    if (index >= 0) this.splice(index, 1);
  };
  const pushRegistration = event.registrations.push.bind(event.registrations);
  event.registrations.push = (registration) => {
    registration._id ||= new mongoose.Types.ObjectId();
    registration.createdAt ||= new Date();
    return pushRegistration(registration);
  };

  return event;
}

function installMocks(t, event) {
  const originals = {
    findOne: Event.findOne,
    find: Event.find,
    notificationCreate: Notification.create,
  };
  const createdNotifications = [];

  Event.findOne = () => ({
    select: async () => event,
  });
  Event.find = () => ({
    select: async () => [event],
  });
  Notification.create = async (notification) => {
    createdNotifications.push(notification);
    return notification;
  };

  t.after(() => {
    Event.findOne = originals.findOne;
    Event.find = originals.find;
    Notification.create = originals.notificationCreate;
  });

  return { createdNotifications };
}

function makeResponse() {
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

function assertStudentOnlyMiddleware(middleware) {
  const studentResponse = makeResponse();
  let studentNextCalled = false;
  middleware(
    { user: { role: 'Student' } },
    studentResponse,
    () => { studentNextCalled = true; }
  );
  assert.equal(studentNextCalled, true);

  const organizerResponse = makeResponse();
  let organizerNextCalled = false;
  middleware(
    { user: { role: 'Organizer' } },
    organizerResponse,
    () => { organizerNextCalled = true; }
  );
  assert.equal(organizerResponse.statusCode, 403);
  assert.equal(organizerNextCalled, false);
}

function registrationRequest(handler, body = {}) {
  const res = makeResponse();
  return handler({
    params: { eventId: String(eventId) },
    user: { _id: studentId },
    body,
  }, res, (error) => {
    throw error;
  }).then(() => res);
}

test('approved event registration creates a unique code and QR payload', async (t) => {
  const event = makeEvent();
  const { createdNotifications } = installMocks(t, event);

  const res = await registrationRequest(registerForEvent);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.registration.status, 'Registered');
  assert.match(res.payload.data.registration.registrationCode, /^[a-f0-9]{64}$/);
  assert.match(
    res.payload.data.registration.qrPayload,
    new RegExp(`^CEMS-REGISTRATION:${eventId}:`)
  );
  assert.equal(event.registeredStudents.length, 1);
  assert.equal(event.saveCalls, 1);
  assert.equal(createdNotifications[0].type, 'REGISTRATION_CONFIRMATION');
});

test('a full event adds the student to the waitlist without creating a ticket', async (t) => {
  const event = makeEvent({ registeredStudents: [otherStudentId] });
  const { createdNotifications } = installMocks(t, event);

  const res = await registrationRequest(registerForEvent);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.registration.status, 'Waitlisted');
  assert.equal(res.payload.data.registration.registrationCode, undefined);
  assert.equal(event.registeredStudents.length, 1);
  assert.equal(createdNotifications.length, 0);
});

test('duplicate active registration and expired registration deadline are rejected', async (t) => {
  const event = makeEvent({
    registrations: [makeRegistration(studentId, 'Registered')],
    registeredStudents: [studentId],
  });
  installMocks(t, event);

  let res = await registrationRequest(registerForEvent);
  assert.equal(res.statusCode, 409);

  event.registrations = [];
  event.registeredStudents = [];
  event.registrationDeadline = new Date(Date.now() - 1000);
  res = await registrationRequest(registerForEvent);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.message, /deadline has passed/i);
});

test('cancelling a confirmed registration promotes the earliest waitlisted student', async (t) => {
  const firstWaitlisted = makeRegistration(
    otherStudentId,
    'Waitlisted',
    new Date(Date.now() - 2000)
  );
  const secondWaitlisted = makeRegistration(
    new mongoose.Types.ObjectId(),
    'Waitlisted',
    new Date(Date.now() - 1000)
  );
  const event = makeEvent({
    registeredStudents: [studentId],
    registrations: [
      makeRegistration(studentId, 'Registered'),
      secondWaitlisted,
      firstWaitlisted,
    ],
  });
  const { createdNotifications } = installMocks(t, event);

  const res = await registrationRequest(cancelRegistration);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.promoted, true);
  assert.equal(firstWaitlisted.status, 'Registered');
  assert.match(firstWaitlisted.registrationCode, /^[a-f0-9]{64}$/);
  assert.equal(secondWaitlisted.status, 'Waitlisted');
  assert.equal(event.registeredStudents.length, 1);
  assert.equal(String(event.registeredStudents[0]), String(otherStudentId));
  assert.equal(createdNotifications[0].type, 'WAITLIST_PROMOTED');
});

test('students can retrieve only their own active upcoming tickets and waitlist entries', async (t) => {
  const ownRegistered = makeRegistration(studentId, 'Registered');
  ownRegistered.registrationCode = 'a'.repeat(64);
  const ownWaitlisted = makeRegistration(studentId, 'Waitlisted');
  const otherRegistration = makeRegistration(otherStudentId, 'Registered');
  otherRegistration.registrationCode = 'b'.repeat(64);
  const event = makeEvent({
    registrations: [ownRegistered, ownWaitlisted, otherRegistration],
  });
  installMocks(t, event);
  const res = makeResponse();

  await listMyRegistrations({ user: { _id: studentId } }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.registrations.length, 2);
  assert.ok(res.payload.data.registrations.every(
    (registration) => String(registration.event.id) === String(eventId)
  ));
  assert.equal(res.payload.data.registrations[0].registrationCode, 'a'.repeat(64));
  assert.equal(res.payload.data.registrations[1].registrationCode, undefined);
});

test('registration endpoints are restricted to authenticated Students', () => {
  const expectedEventRoutes = [
    ['/:eventId/register', 'post'],
    ['/:eventId/register', 'delete'],
  ];

  for (const [path, method] of expectedEventRoutes) {
    const route = eventRoutes.stack.find(
      (layer) => layer.route?.path === path && layer.route.methods[method]
    )?.route;
    assert.ok(route);
    assert.ok(route.stack.length >= 2);
    assertStudentOnlyMiddleware(route.stack[0].handle);
  }

  const myRegistrations = registrationRoutes.stack.find(
    (layer) => layer.route?.path === '/me' && layer.route.methods.get
  )?.route;
  assert.ok(myRegistrations);
  assert.ok(myRegistrations.stack.length >= 2);
  assert.equal(myRegistrations.stack[0].name, 'protect');
  assertStudentOnlyMiddleware(myRegistrations.stack[1].handle);
});

test('event registration codes are hidden by default and event saves use optimistic concurrency', () => {
  assert.equal(Event.schema.options.optimisticConcurrency, true);
  assert.equal(
    Event.schema.path('registrations.registrationCode').options.select,
    false
  );
});
