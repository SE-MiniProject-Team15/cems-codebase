const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Event');
const { listEvents } = require('../controllers/eventController');

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

function captureAggregate(t, result) {
  const originalAggregate = Event.aggregate;
  let pipeline;

  Event.aggregate = async (value) => {
    pipeline = value;
    return [result];
  };

  t.after(() => {
    Event.aggregate = originalAggregate;
  });

  return () => pipeline;
}

test('event discovery combines escaped search, filters, date range, and popularity sort', async (t) => {
  const getPipeline = captureAggregate(t, {
    events: [{
      _id: 'event-1',
      title: 'Tech Fest',
      category: 'Technical',
      description: 'A campus event',
      venue: 'Auditorium',
      department: 'Engineering',
      startDateTime: new Date('2026-10-15T10:00:00Z'),
      endDateTime: new Date('2026-10-15T12:00:00Z'),
      registrationDeadline: new Date('2026-10-14T10:00:00Z'),
      capacity: 100,
      registrationCount: 40,
    }],
    metadata: [{ total: 1 }],
  });
  const res = response();

  await listEvents({
    query: {
      q: 'Tech.* Fest',
      category: 'Technical',
      venue: 'Auditorium',
      department: 'Engineering',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      sort: 'popular',
      page: '1',
      limit: '10',
    },
  }, res, (error) => {
    throw error;
  });

  const pipeline = getPipeline();
  const filters = pipeline.find(
    (stage) => stage.$match?.startDateTime
  ).$match;
  const facet = pipeline.find((stage) => stage.$facet).$facet;

  assert.equal(filters.$or[0].title.test('Tech.* Fest'), true);
  assert.equal(filters.$or[0].title.test('TechXYZ Fest'), false);
  assert.equal(filters.category.test('technical'), true);
  assert.equal(filters.venue.test('Auditorium'), true);
  assert.equal(filters.department.test('Engineering'), true);
  assert.equal(filters.startDateTime.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(filters.startDateTime.$lte.toISOString(), '2026-10-31T23:59:59.999Z');
  assert.deepEqual(facet.events[0].$sort, {
    registrationCount: -1,
    startDateTime: 1,
  });
  assert.equal(res.payload.data.events[0].remainingSeats, 60);
  assert.equal(res.payload.data.pagination.total, 1);
});

test('event discovery defaults to future events sorted chronologically', async (t) => {
  const getPipeline = captureAggregate(t, {
    events: [],
    metadata: [],
  });
  const res = response();

  await listEvents({ query: {} }, res, (error) => {
    throw error;
  });

  const pipeline = getPipeline();
  const filters = pipeline.find(
    (stage) => stage.$match?.startDateTime
  ).$match;
  const dateSort = pipeline.find(
    (stage) => stage.$facet
  ).$facet.events[0].$sort;

  assert.ok(filters.startDateTime.$gte instanceof Date);
  assert.deepEqual(dateSort, { startDateTime: 1 });
  assert.deepEqual(res.payload.data.events, []);
  assert.equal(res.payload.data.pagination.total, 0);
});

test('event discovery rejects unsupported sorting and reversed date ranges', async () => {
  for (const query of [
    { sort: 'title' },
    { dateFrom: '2026-10-31', dateTo: '2026-10-01' },
  ]) {
    let nextError;

    await listEvents({ query }, response(), (error) => {
      nextError = error;
    });

    assert.equal(nextError.statusCode, 400);
  }
});
