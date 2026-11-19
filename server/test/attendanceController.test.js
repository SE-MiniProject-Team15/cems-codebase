const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventAuditLog = require('../models/EventAuditLog');
const { checkInStudent } = require('../controllers/eventController');

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

function installEventMocks(t, event, updateResult = { modifiedCount: 1 }) {
  const originals = {
    findById: Event.findById,
    updateOne: Event.updateOne,
    auditCreate: EventAuditLog.create,
  };
  let updateFilter;
  let update;

  Event.findById = async () => event;
  Event.updateOne = async (filter, changes) => {
    updateFilter = filter;
    update = changes;
    return updateResult;
  };
  EventAuditLog.create = async (record) => record;

  t.after(() => {
    Event.findById = originals.findById;
    Event.updateOne = originals.updateOne;
    EventAuditLog.create = originals.auditCreate;
  });

  return () => ({ updateFilter, update });
}

function attendanceFixture(overrides = {}) {
  const eventId = new mongoose.Types.ObjectId();
  const organizerId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const registrationId = new mongoose.Types.ObjectId();
  const registrationCode = 'a'.repeat(64);
  const registration = {
    _id: registrationId,
    student: studentId,
    status: 'Registered',
    registrationCode,
    attendedAt: null,
  };
  const event = {
    _id: eventId,
    organizer: organizerId,
    status: 'Approved',
    startDateTime: new Date(Date.now() - 60_000),
    endDateTime: new Date(Date.now() + 60_000),
    registrations: {
      id(id) {
        return String(id) === String(registrationId)
          ? registration
          : undefined;
      },
      find(predicate) {
        return predicate(registration) ? registration : undefined;
      },
    },
    ...overrides,
  };

  return {
    event,
    eventId,
    organizerId,
    studentId,
    registrationId,
    registrationCode,
    payload: `CEMS-REGISTRATION:${eventId}:${registrationId}:${registrationCode}`,
  };
}

function requestFor(fixture, code = fixture.payload) {
  return {
    params: { eventId: String(fixture.eventId) },
    user: { _id: fixture.organizerId },
    body: { code },
  };
}

test('a valid QR payload checks in the matching event registration once', async (t) => {
  const fixture = attendanceFixture();
  const getUpdate = installEventMocks(t, fixture.event);
  const res = makeResponse();

  await checkInStudent(requestFor(fixture), res, (error) => {
    throw error;
  });

  const { updateFilter, update } = getUpdate();
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.eventId, String(fixture.eventId));
  assert.equal(res.payload.data.studentId, String(fixture.studentId));
  assert.equal(
    String(updateFilter.registrations.$elemMatch._id),
    String(fixture.registrationId)
  );
  assert.equal(
    updateFilter.registrations.$elemMatch.registrationCode,
    fixture.registrationCode
  );
  assert.equal(update['$set']['registrations.$.checkedInBy'], fixture.organizerId);
  assert.ok(update['$set']['registrations.$.attendedAt'] instanceof Date);
});

test('a trimmed case-insensitive short registration code checks in for its active event', async (t) => {
  const fixture = attendanceFixture();
  const getUpdate = installEventMocks(t, fixture.event);
  const res = makeResponse();

  await checkInStudent(
    requestFor(fixture, `  ${fixture.registrationCode.toUpperCase()}  `),
    res,
    (error) => { throw error; }
  );

  const { updateFilter } = getUpdate();
  assert.equal(res.statusCode, 200);
  assert.equal(updateFilter._id.toString(), String(fixture.eventId));
  assert.equal(updateFilter.registrations.$elemMatch.registrationCode, fixture.registrationCode);
});

test('a re-scan is rejected without writing a second attendance record', async (t) => {
  const fixture = attendanceFixture();
  fixture.event.registrations.id = () => ({
    status: 'Registered',
    attendedAt: new Date(),
  });
  const getUpdate = installEventMocks(t, fixture.event);
  const res = makeResponse();

  await checkInStudent(requestFor(fixture), res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.message, /already been checked in/i);
  assert.equal(getUpdate().updateFilter, undefined);
});

test('invalid or wrong-event QR payloads are rejected before database access', async (t) => {
  const fixture = attendanceFixture();
  const getUpdate = installEventMocks(t, fixture.event);

  for (const code of [
    'REG-99999X',
    `CEMS-REGISTRATION:${new mongoose.Types.ObjectId()}:${fixture.registrationId}:${fixture.registrationCode}`,
  ]) {
    const res = makeResponse();

    await checkInStudent(requestFor(fixture, code), res, (error) => {
      throw error;
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /valid ticket for this event/i);
  }

  assert.equal(getUpdate().updateFilter, undefined);
});

test('check-in is rejected before the event starts and after it ends', async (t) => {
  for (const timeWindow of [
    { startDateTime: new Date(Date.now() + 60_000) },
    { endDateTime: new Date(Date.now() - 60_000) },
  ]) {
    const fixture = attendanceFixture(timeWindow);
    const getUpdate = installEventMocks(t, fixture.event);
    const res = makeResponse();

    await checkInStudent(requestFor(fixture), res, (error) => {
      throw error;
    });

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /only during the event/i);
    assert.equal(getUpdate().updateFilter, undefined);
  }
});

test('check-in fails closed when another organizer owns the event', async (t) => {
  const fixture = attendanceFixture({
    organizer: new mongoose.Types.ObjectId(),
  });
  const getUpdate = installEventMocks(t, fixture.event);
  const res = makeResponse();

  await checkInStudent(requestFor(fixture), res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(getUpdate().updateFilter, undefined);
});
