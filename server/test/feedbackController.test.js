const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Feedback = require('../models/Feedback');
const feedbackRoutes = require('../routes/feedbackRoutes');
const {
  submitFeedback,
  getEventFeedback,
} = require('../controllers/feedbackController');

const eventId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const organizerId = new mongoose.Types.ObjectId();
const otherOrganizerId = new mongoose.Types.ObjectId();

function makeEvent(overrides = {}) {
  return {
    _id: eventId,
    status: 'Approved',
    endDateTime: new Date(Date.now() - 60 * 1000),
    organizer: organizerId,
    registrations: [{
      student: studentId,
      status: 'Registered',
      attendanceStatus: 'Present',
    }],
    ...overrides,
  };
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

function installMocks(t, event, existingFeedback = null, aggregateResult) {
  const originals = {
    findById: Event.findById,
    findOne: Feedback.findOne,
    create: Feedback.create,
    aggregate: Feedback.aggregate,
  };
  const createdFeedback = [];

  Event.findById = async () => event;
  Feedback.findOne = async () => existingFeedback;
  Feedback.create = async (data) => {
    const feedback = { ...data, createdAt: new Date() };
    createdFeedback.push(feedback);
    return feedback;
  };
  Feedback.aggregate = async () => [aggregateResult || {
    summary: [],
    distribution: [],
    comments: [],
  }];

  t.after(() => {
    Event.findById = originals.findById;
    Feedback.findOne = originals.findOne;
    Feedback.create = originals.create;
    Feedback.aggregate = originals.aggregate;
  });

  return { createdFeedback };
}

function callController(handler, user, body = {}) {
  const res = makeResponse();
  return handler({
    params: { eventId: String(eventId) },
    user,
    body,
  }, res, (error) => {
    throw error;
  }).then(() => res);
}

test('eligible students can submit one valid rating with an optional comment', async (t) => {
  const { createdFeedback } = installMocks(t, makeEvent());

  const res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 5, comment: '  Great event!  ' }
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.feedback.rating, 5);
  assert.equal(res.payload.data.feedback.comment, 'Great event!');
  assert.equal(createdFeedback.length, 1);
  assert.equal('student' in res.payload.data.feedback, false);
});

test('feedback is rejected before the event ends and for students not marked Present', async (t) => {
  const event = makeEvent({
    endDateTime: new Date(Date.now() + 60 * 1000),
  });
  installMocks(t, event);

  let res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 4 }
  );
  assert.equal(res.statusCode, 403);
  assert.match(res.payload.message, /after the event has ended/i);

  event.endDateTime = new Date(Date.now() - 60 * 1000);
  event.registrations[0].attendanceStatus = 'Absent';
  res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 4 }
  );
  assert.equal(res.statusCode, 403);
  assert.match(res.payload.message, /marked Present/i);
});

test('feedback validates rating and comment before creating a document', async (t) => {
  const { createdFeedback } = installMocks(t, makeEvent());

  let res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 5.5 }
  );
  assert.equal(res.statusCode, 400);

  res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 4, comment: 'x'.repeat(1001) }
  );
  assert.equal(res.statusCode, 400);
  assert.equal(createdFeedback.length, 0);
});

test('duplicate submissions return the existing feedback read-only', async (t) => {
  const existingFeedback = {
    rating: 3,
    comment: 'Already submitted',
    createdAt: new Date(),
    student: studentId,
  };
  installMocks(t, makeEvent(), existingFeedback);

  const res = await callController(
    submitFeedback,
    { _id: studentId, role: 'Student' },
    { rating: 4 }
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.data.feedback.rating, 3);
  assert.equal('student' in res.payload.data.feedback, false);
});

test('students can retrieve only their own existing feedback', async (t) => {
  const existingFeedback = {
    rating: 4,
    comment: 'Useful',
    createdAt: new Date(),
    student: studentId,
  };
  installMocks(t, makeEvent(), existingFeedback);

  const res = await callController(
    getEventFeedback,
    { _id: studentId, role: 'Student' }
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.payload.data.feedback).sort(), [
    'comment',
    'rating',
    'submittedAt',
  ]);
});

test('organizer feedback results are anonymous and limited to their own events', async (t) => {
  const aggregateResult = {
    summary: [{ totalResponses: 2, averageRating: 4.5 }],
    distribution: [{ _id: 4, count: 1 }, { _id: 5, count: 1 }],
    comments: [{ rating: 4, comment: 'Great!', submittedAt: new Date() }],
  };
  installMocks(t, makeEvent(), null, aggregateResult);

  const res = await callController(
    getEventFeedback,
    { _id: organizerId, role: 'Organizer' }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.averageRating, 4.5);
  assert.equal(res.payload.data.totalResponses, 2);
  assert.deepEqual(res.payload.data.ratingDistribution, {
    1: 0,
    2: 0,
    3: 0,
    4: 1,
    5: 1,
  });
  assert.equal('student' in res.payload.data.comments[0], false);

  const denied = await callController(
    getEventFeedback,
    { _id: otherOrganizerId, role: 'Organizer' }
  );
  assert.equal(denied.statusCode, 403);
});

test('feedback schema enforces range, comment length, attendance default, and unique event/student index', async () => {
  const feedback = new Feedback({
    event: eventId,
    student: studentId,
    rating: 6,
    comment: 'x'.repeat(1001),
  });
  await assert.rejects(feedback.validate());

  assert.ok(Feedback.schema.indexes().some(([keys, options]) =>
    keys.event === 1 && keys.student === 1 && options.unique
  ));
  assert.equal(
    Event.schema.path('registrations').schema.path('attendanceStatus').defaultValue,
    'Absent'
  );
});

test('feedback routes require authentication and restrict submission to Students', () => {
  const postRoute = feedbackRoutes.stack.find(
    (layer) => layer.route?.path === '/:eventId/feedback' &&
      layer.route.methods.post
  )?.route;
  const getRoute = feedbackRoutes.stack.find(
    (layer) => layer.route?.path === '/:eventId/feedback' &&
      layer.route.methods.get
  )?.route;

  assert.ok(postRoute);
  assert.ok(getRoute);
  assert.equal(postRoute.stack[0].name, 'protect');
  assert.equal(postRoute.stack.length, 3);
  assert.equal(getRoute.stack[0].name, 'protect');
  assert.equal(getRoute.stack.length, 2);

  let nextCalled = false;
  postRoute.stack[1].handle(
    { user: { role: 'Student' } },
    makeResponse(),
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);

  const denied = makeResponse();
  postRoute.stack[1].handle(
    { user: { role: 'Organizer' } },
    denied,
    () => assert.fail('Non-students must not submit feedback')
  );
  assert.equal(denied.statusCode, 403);
});
