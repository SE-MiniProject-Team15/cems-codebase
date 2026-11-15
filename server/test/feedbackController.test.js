const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const app = require('../server');
const {
  submitFeedback,
  getMyFeedback,
  getEventFeedback,
  getAdminFeedbackSummary,
  listEligibleFeedbackEvents,
} = require('../controllers/feedbackController');

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

function fixture(overrides = {}) {
  const eventId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const organizerId = new mongoose.Types.ObjectId();
  const event = {
    _id: eventId,
    title: 'Completed event',
    status: 'Approved',
    organizer: organizerId,
    endDateTime: new Date(Date.now() - 60_000),
    registrations: [{
      student: studentId,
      status: 'Registered',
      attendedAt: new Date(Date.now() - 120_000),
    }],
    ...overrides,
  };

  return { event, eventId, studentId, organizerId };
}

function requestFor(values, body = {}, role = 'Student') {
  return {
    params: { id: String(values.eventId) },
    user: {
      _id: role === 'Organizer' ? values.organizerId : values.studentId,
      role,
    },
    body,
  };
}

function mockMethod(t, target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  t.after(() => {
    target[name] = original;
  });
}

function mockEvent(t, event) {
  mockMethod(t, Event, 'findById', async () => event);
}

test('FR08_UT_01 rejects feedback before the scheduled event end', async (t) => {
  const values = fixture({ endDateTime: new Date(Date.now() + 60_000) });
  mockEvent(t, values.event);
  let created = false;
  mockMethod(t, Feedback, 'findOne', async () => null);
  mockMethod(t, Feedback, 'create', async () => {
    created = true;
  });
  const res = response();

  await submitFeedback(requestFor(values, { rating: 4 }), res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.message, /after the event ends/i);
  assert.equal(created, false);
});

test('FR08_UT_02 rejects non-integer ratings outside the 1–5 range', async (t) => {
  const values = fixture();
  mockEvent(t, values.event);

  for (const rating of [0, 6, 1.5, '5']) {
    const res = response();
    await submitFeedback(requestFor(values, { rating }), res, (error) => {
      throw error;
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /integer between 1 and 5/i);
  }
});

test('FR08_UT_03 saves valid feedback, trims comments, and returns it read-only', async (t) => {
  const values = fixture();
  const saved = {
    _id: new mongoose.Types.ObjectId(),
    event: values.eventId,
    student: values.studentId,
    rating: 4,
    comment: 'Well organized event!',
    createdAt: new Date(),
  };
  let storedFeedback = null;
  mockEvent(t, values.event);
  mockMethod(t, Feedback, 'findOne', async () => storedFeedback);
  mockMethod(t, Feedback, 'create', async (record) => {
    assert.equal(record.comment, 'Well organized event!');
    storedFeedback = saved;
    return saved;
  });
  const submission = response();

  await submitFeedback(
    requestFor(values, { rating: 4, comment: '  Well organized event!  ' }),
    submission,
    (error) => {
      throw error;
    }
  );

  assert.equal(submission.statusCode, 201);
  assert.equal(submission.payload.data.feedback.rating, 4);
  assert.equal(submission.payload.data.feedback.comment, 'Well organized event!');

  const ownFeedback = response();
  await getMyFeedback(requestFor(values), ownFeedback, (error) => {
    throw error;
  });
  assert.equal(ownFeedback.statusCode, 200);
  assert.equal(ownFeedback.payload.data.feedback, saved);

  const eligibleEvents = [values.event];
  mockMethod(t, Event, 'find', async () => eligibleEvents);
  const eligible = response();
  await listEligibleFeedbackEvents(requestFor(values), eligible, (error) => {
    throw error;
  });
  assert.deepEqual(eligible.payload.data.events, [{
    id: String(values.eventId),
    title: 'Completed event',
    endDateTime: values.event.endDateTime,
  }]);
});

test('FR08_IT_01 only allows confirmed registrations with recorded attendance', async (t) => {
  const values = fixture();
  mockEvent(t, values.event);
  let writes = 0;
  mockMethod(t, Feedback, 'findOne', async () => null);
  mockMethod(t, Feedback, 'create', async () => {
    writes += 1;
  });

  const ineligibleRegistrations = [
    [],
    [{ student: values.studentId, status: 'Waitlisted', attendedAt: new Date() }],
    [{ student: values.studentId, status: 'Registered', attendedAt: null }],
  ];
  for (const registrations of ineligibleRegistrations) {
    values.event.registrations = registrations;
    const res = response();
    await submitFeedback(requestFor(values, { rating: 5 }), res, (error) => {
      throw error;
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.payload.message, /only to students marked Present/i);
  }
  assert.equal(writes, 0);
});

test('FR08_IT_02 rejects duplicates and handles concurrent unique-index conflicts', async (t) => {
  const values = fixture();
  mockEvent(t, values.event);
  const indexes = Feedback.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.event === 1 && keys.student === 1 && options.unique === true
  ));

  mockMethod(t, Feedback, 'findOne', async () => ({
    _id: new mongoose.Types.ObjectId(),
  }));
  const duplicate = response();
  await submitFeedback(requestFor(values, { rating: 5 }), duplicate, (error) => {
    throw error;
  });
  assert.equal(duplicate.statusCode, 409);

  mockMethod(t, Feedback, 'findOne', async () => null);
  const inserts = new Set();
  mockMethod(t, Feedback, 'create', async (record) => {
    const key = `${record.event}:${record.student}`;
    if (inserts.has(key)) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    inserts.add(key);
    return record;
  });

  const results = await Promise.all([1, 2].map(async () => {
    const res = response();
    await submitFeedback(requestFor(values, { rating: 5 }), res, (error) => {
      throw error;
    });
    return res.statusCode;
  }));
  assert.deepEqual(results.sort(), [201, 409]);
});

test('FR08_IT_03 returns owner-only event aggregates and zero-safe distributions', async (t) => {
  const values = fixture();
  const entries = [
    { rating: 5, comment: 'Excellent', createdAt: new Date(), student: { name: 'Private', email: 'private@example.test' } },
    { rating: 3, comment: 'Good', createdAt: new Date(), student: values.studentId },
  ];
  mockEvent(t, values.event);
  mockMethod(t, Feedback, 'find', async () => entries);
  const organizerReport = response();

  await getEventFeedback(requestFor(values, {}, 'Organizer'), organizerReport, (error) => {
    throw error;
  });

  assert.equal(organizerReport.statusCode, 200);
  assert.equal(organizerReport.payload.data.averageRating, 4);
  assert.equal(organizerReport.payload.data.totalResponses, 2);
  assert.deepEqual(organizerReport.payload.data.ratingDistribution, {
    1: 0, 2: 0, 3: 1, 4: 0, 5: 1,
  });
  assert.deepEqual(organizerReport.payload.data.feedback[0], {
    rating: 5,
    comment: 'Excellent',
    createdAt: entries[0].createdAt,
  });

  values.event.organizer = new mongoose.Types.ObjectId();
  const forbidden = response();
  await getEventFeedback(requestFor(values, {}, 'Organizer'), forbidden, (error) => {
    throw error;
  });
  assert.equal(forbidden.statusCode, 403);
});

test('FR08_IT_04 routes expose anonymous entries to authorized roles only', async (t) => {
  const values = fixture();
  const feedback = [{
    rating: 4,
    comment: 'Anonymous note',
    createdAt: new Date(),
    student: { name: 'Hidden Student', email: 'hidden@example.test' },
  }];
  const secret = 'feedback-route-test-secret';
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  mockMethod(t, Event, 'findById', async () => values.event);
  mockMethod(t, Feedback, 'find', async () => feedback);
  const roles = new Map([
    [String(values.organizerId), 'Organizer'],
    [String(values.studentId), 'Student'],
  ]);
  mockMethod(t, User, 'findById', async (id) => ({
    _id: id,
    role: roles.get(String(id)),
  }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const organizerToken = jwt.sign({ id: String(values.organizerId) }, secret);
  const reportResponse = await fetch(
    `${baseUrl}/api/events/${values.eventId}/feedback`,
    { headers: { Authorization: `Bearer ${organizerToken}` } }
  );
  const report = await reportResponse.json();
  assert.equal(reportResponse.status, 200);
  assert.deepEqual(Object.keys(report.data.feedback[0]).sort(), [
    'comment', 'createdAt', 'rating',
  ]);
  assert.doesNotMatch(JSON.stringify(report), /Hidden Student|hidden@example.test/);

  const studentToken = jwt.sign({ id: String(values.studentId) }, secret);
  const forbidden = await fetch(
    `${baseUrl}/api/events/${values.eventId}/feedback`,
    { headers: { Authorization: `Bearer ${studentToken}` } }
  );
  assert.equal(forbidden.status, 403);
});

test('FR08_ST_01 completes submission through Organizer and Admin reporting', async (t) => {
  const values = fixture();
  const records = [];
  mockEvent(t, values.event);
  mockMethod(t, Event, 'find', async () => [values.event]);
  mockMethod(t, Feedback, 'findOne', async ({ student }) =>
    records.find((entry) => String(entry.student) === String(student)) || null
  );
  mockMethod(t, Feedback, 'create', async (record) => {
    const saved = { ...record, createdAt: new Date() };
    records.push(saved);
    return saved;
  });
  mockMethod(t, Feedback, 'find', async (query) => {
    if (query.event?.$in) return records;
    return records.filter((entry) => String(entry.event) === String(query.event));
  });

  const submitResponse = response();
  await submitFeedback(
    requestFor(values, { rating: 5, comment: 'Great event' }),
    submitResponse,
    (error) => {
      throw error;
    }
  );
  assert.equal(submitResponse.statusCode, 201);

  const organizerResponse = response();
  await getEventFeedback(
    requestFor(values, {}, 'Organizer'),
    organizerResponse,
    (error) => {
      throw error;
    }
  );
  assert.equal(organizerResponse.payload.data.totalResponses, 1);
  assert.equal(organizerResponse.payload.data.averageRating, 5);

  const adminResponse = response();
  await getAdminFeedbackSummary(
    requestFor(values, {}, 'Admin'),
    adminResponse,
    (error) => {
      throw error;
    }
  );
  assert.equal(adminResponse.payload.data.totalResponses, 1);
  assert.equal(adminResponse.payload.data.events[0].feedback[0].comment, 'Great event');
});

test('FR08_ST_02 reports events with no submissions without an error', async (t) => {
  const values = fixture();
  mockMethod(t, Event, 'find', async () => [values.event]);
  mockMethod(t, Feedback, 'find', async () => []);
  const res = response();

  await getAdminFeedbackSummary(requestFor(values, {}, 'Admin'), res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.events[0].averageRating, 0);
  assert.equal(res.payload.data.events[0].totalResponses, 0);
  assert.deepEqual(res.payload.data.events[0].ratingDistribution, {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  });
  assert.deepEqual(res.payload.data.events[0].feedback, []);
});
