const test = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const Event = require('../models/Event')
const EventAuditLog = require('../models/EventAuditLog')
const Notification = require('../models/Notification')
const { restrictTo } = require('../middleware/authMiddleware')
const eventRouter = require('../routes/eventRoutes')
const {
  listPendingEvents,
  getPendingEventDetails,
  decideEvent,
  updateEvent,
} = require('../controllers/eventController')

const eventId = '507f1f77bcf86cd799439011'
const adminId = '507f1f77bcf86cd799439012'
const organizerId = '507f1f77bcf86cd799439013'
const details = {
  title: 'Pending event',
  category: 'Workshop',
  description: 'A useful workshop',
  venue: 'Main Hall',
  department: 'Engineering',
  startDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  endDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  capacity: 40,
  bannerUrl: 'https://example.com/event.png',
  registrationDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function makeEvent(overrides = {}) {
  return {
    ...details,
    _id: eventId,
    organizer: organizerId,
    status: 'Pending Approval',
    approvedSnapshot: undefined,
    registeredStudents: [],
    saveCalls: 0,
    toObject() {
      return { ...this }
    },
    async save() {
      this.saveCalls += 1
    },
    ...overrides,
  }
}

function queryFor(value) {
  return {
    session: async () => value,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function installTransactionMocks(t, event, { notificationError, auditError } = {}) {
  const originals = {
    startSession: mongoose.startSession,
    findOne: Event.findOne,
    find: Event.find,
    exists: Event.exists,
    auditCreate: EventAuditLog.create,
    notificationCreate: Notification.create,
  }
  const auditRecords = []
  const notifications = []
  let findOneQuery

  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      const before = {
        status: event.status,
        approvedSnapshot: event.approvedSnapshot,
        saveCalls: event.saveCalls,
        auditCount: auditRecords.length,
        notificationCount: notifications.length,
      }
      try {
        await callback()
      } catch (error) {
        event.status = before.status
        event.approvedSnapshot = before.approvedSnapshot
        event.saveCalls = before.saveCalls
        auditRecords.length = before.auditCount
        notifications.length = before.notificationCount
        throw error
      }
    },
    async endSession() {},
  })
  Event.findOne = (filter) => {
    findOneQuery = filter
    const matchesId = String(filter._id) === String(event._id)
    const matchesStatus = filter.status === undefined || filter.status === event.status
    return queryFor(
      matchesId && matchesStatus ? event : null
    )
  }
  Event.find = () => ({ sort: async () => [event] })
  Event.exists = async () => null
  EventAuditLog.create = async ([record]) => {
    if (auditError) throw auditError
    auditRecords.push(record)
    return [record]
  }
  Notification.create = async ([notification]) => {
    if (notificationError) throw notificationError
    notifications.push(notification)
    return [notification]
  }

  t.after(() => {
    mongoose.startSession = originals.startSession
    Event.findOne = originals.findOne
    Event.find = originals.find
    Event.exists = originals.exists
    EventAuditLog.create = originals.auditCreate
    Notification.create = originals.notificationCreate
  })

  return { auditRecords, notifications, getFindOneQuery: () => findOneQuery }
}

test('every administrator event review route is behind authentication and Admin authorization', () => {
  const routePaths = [
    ['/admin/pending', 'get'],
    ['/admin/pending/:id', 'get'],
    ['/admin/:id/decision', 'patch'],
    ['/:id/approve', 'patch'],
  ]

  for (const [path, method] of routePaths) {
    const route = eventRouter.stack.find(
      (layer) => layer.route?.path === path && layer.route.methods[method]
    )?.route
    assert.ok(route, `${method.toUpperCase()} ${path} is registered`)
    assert.ok(route.stack.length >= 2, `${method.toUpperCase()} ${path} has role middleware`)

    const res = response()
    let nextCalled = false
    route.stack[0].handle(
      { user: { role: 'Organizer' } },
      res,
      () => { nextCalled = true },
    )
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)

    let adminNextCalled = false
    route.stack[0].handle(
      { user: { role: 'Admin' } },
      response(),
      () => { adminNextCalled = true },
    )
    assert.equal(adminNextCalled, true)
  }

  assert.equal(
    eventRouter.stack.find((layer) => !layer.route).handle,
    require('../middleware/authMiddleware').protect,
  )
  assert.equal(typeof restrictTo, 'function')
})

test('admin can list pending events and retrieve details only for pending events', async (t) => {
  const event = makeEvent()
  const originals = { find: Event.find, findOne: Event.findOne }
  Event.find = (filter) => {
    assert.deepEqual(filter, { status: 'Pending Approval' })
    return { sort: async () => [event] }
  }
  Event.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: eventId, status: 'Pending Approval' })
    return event
  }
  t.after(() => {
    Event.find = originals.find
    Event.findOne = originals.findOne
  })

  const queueResponse = response()
  await listPendingEvents({}, queueResponse, (error) => { throw error })
  assert.equal(queueResponse.payload.data.events.length, 1)
  assert.equal(queueResponse.payload.data.events[0].title, event.title)
  assert.equal(queueResponse.payload.data.events[0].registeredStudents, undefined)
  assert.equal(queueResponse.payload.data.events[0].approvedSnapshot, undefined)

  const detailResponse = response()
  await getPendingEventDetails({ params: { id: eventId } }, detailResponse, (error) => { throw error })
  assert.equal(detailResponse.payload.data.event.title, event.title)
  assert.equal(detailResponse.payload.data.event.registeredStudents, undefined)

  const invalidResponse = response()
  await getPendingEventDetails({ params: { id: 'bad-id' } }, invalidResponse, (error) => { throw error })
  assert.equal(invalidResponse.statusCode, 400)
})

for (const scenario of [
  { action: 'approve', status: 'Approved', audit: 'APPROVE' },
  { action: 'reject', status: 'Rejected', audit: 'REJECT', field: 'reason', comment: 'Insufficient details' },
  { action: 'request_changes', status: 'Changes Requested', audit: 'REQUEST_CHANGES', field: 'comments', comment: 'Add a speaker bio' },
]) {
  test(`${scenario.action} records event state, audit entry, and organizer notification`, async (t) => {
    const event = makeEvent()
    const mocks = installTransactionMocks(t, event)
    const res = response()
    await decideEvent({
      params: { id: eventId },
      user: { _id: adminId },
      body: { action: scenario.action, ...(scenario.field && { [scenario.field]: scenario.comment }) },
    }, res, (error) => { throw error })

    assert.equal(res.statusCode, 200)
    assert.equal(event.status, scenario.status)
    assert.equal(mocks.auditRecords.length, 1)
    assert.equal(String(mocks.auditRecords[0].administrator), adminId)
    assert.equal(String(mocks.auditRecords[0].event), eventId)
    assert.equal(mocks.auditRecords[0].action, scenario.audit)
    assert.equal(mocks.auditRecords[0].comment, scenario.comment)
    assert.equal(mocks.notifications.length, 1)
    assert.equal(String(mocks.notifications[0].recipient), organizerId)
    assert.equal(mocks.notifications[0].type, 'APPROVAL_DECISION')
    if (scenario.comment) assert.match(mocks.notifications[0].message, new RegExp(scenario.comment))
    assert.equal(res.payload.data.notificationSaved, true)
  })
}

test('rejection requires a non-empty reason and change requests require non-empty comments', async () => {
  for (const [action, body, expected] of [
    ['reject', { action: 'reject', reason: '   ' }, /reason must be at least 10 characters/i],
    ['request_changes', { action: 'request_changes', comments: '' }, /comments must be at least 10 characters/i],
    ['reject', { action: 'reject' }, /reason must be at least 10 characters/i],
    ['request_changes', { action: 'request_changes' }, /comments must be at least 10 characters/i],
    ['reject', { action: 'reject', reason: 'Too short' }, /reason must be at least 10 characters/i],
  ]) {
    const res = response()
    await decideEvent(
      { params: { id: eventId }, user: { _id: adminId }, body },
      res,
      (error) => { throw error },
    )
    assert.equal(res.statusCode, 400, action)
    assert.match(res.payload.message, expected)
  }
})

test('decision payloads and event identifiers are validated before starting a transaction', async (t) => {
  const originalStartSession = mongoose.startSession
  let started = false
  mongoose.startSession = async () => {
    started = true
    throw new Error('Should not start a transaction')
  }
  t.after(() => { mongoose.startSession = originalStartSession })

  for (const [id, body, expected] of [
    [eventId, null, /decision payload must be a json object/i],
    ['not-an-object-id', { action: 'approve' }, /invalid event id/i],
    [eventId, { action: 'approve', status: 'Approved' }, /unsupported fields/i],
  ]) {
    const res = response()
    await decideEvent(
      { params: { id }, user: { _id: adminId }, body },
      res,
      (error) => { throw error },
    )
    assert.equal(res.statusCode, 400)
    assert.match(res.payload.message, expected)
  }

  assert.equal(started, false)
})

test('missing event decisions return 404 while non-pending events return 409', async (t) => {
  const event = makeEvent({ status: 'Rejected' })
  const mocks = installTransactionMocks(t, event)

  const staleResponse = response()
  await decideEvent(
    {
      params: { id: eventId },
      user: { _id: adminId },
      body: { action: 'approve' },
    },
    staleResponse,
    (error) => { throw error },
  )
  assert.equal(staleResponse.statusCode, 409)
  assert.equal(mocks.auditRecords.length, 0)

  const missingResponse = response()
  await decideEvent(
    {
      params: { id: '507f1f77bcf86cd799439099' },
      user: { _id: adminId },
      body: { action: 'approve' },
    },
    missingResponse,
    (error) => { throw error },
  )
  assert.equal(missingResponse.statusCode, 404)
})

test('invalid and repeated decisions are rejected without creating audit entries', async (t) => {
  const event = makeEvent({ status: 'Rejected' })
  const mocks = installTransactionMocks(t, event)

  const invalidActionResponse = response()
  await decideEvent(
    { params: { id: eventId }, user: { _id: adminId }, body: { action: 'publish' } },
    invalidActionResponse,
    (error) => { throw error },
  )
  assert.equal(invalidActionResponse.statusCode, 400)

  const repeatedResponse = response()
  await decideEvent(
    { params: { id: eventId }, user: { _id: adminId }, body: { action: 'approve' } },
    repeatedResponse,
    (error) => { throw error },
  )
  assert.equal(repeatedResponse.statusCode, 409)
  assert.equal(mocks.auditRecords.length, 0)
})

test('rejected and change-requested events can only be resubmitted by their organizer', async (t) => {
  const originalFindOne = Event.findOne
  const originalExists = Event.exists
  const event = makeEvent({
    status: 'Rejected',
    approvedSnapshot: { ...details, title: 'Previously published title' },
  })
  Event.findOne = (filter) => queryFor(
    String(filter.organizer) === organizerId ? event : null
  )
  Event.exists = async () => null
  t.after(() => {
    Event.findOne = originalFindOne
    Event.exists = originalExists
  })

  const res = response()
  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId },
      body: { ...details, title: 'Updated title', status: 'Pending Approval' },
    },
    res,
    (error) => { throw error },
  )
  assert.equal(res.statusCode, 200)
  assert.equal(event.status, 'Pending Approval')
  assert.equal(event.title, 'Updated title')
  assert.equal(event.approvedSnapshot.title, 'Previously published title')

  Event.findOne = (filter) => queryFor(
    String(filter.organizer) === organizerId ? event : null
  )
  const wrongOwnerResponse = response()
  Event.findOne = () => queryFor(null)
  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: 'different-organizer-id' },
      body: { ...details, status: 'Pending Approval' },
    },
    wrongOwnerResponse,
    (error) => { throw error },
  )
  assert.equal(wrongOwnerResponse.statusCode, 404)
})

test('the owning organizer can resubmit an event after changes were requested', async (t) => {
  const originalFindOne = Event.findOne
  const originalExists = Event.exists
  const event = makeEvent({
    status: 'Changes Requested',
    approvedSnapshot: { ...details, title: 'Published title' },
  })
  Event.findOne = () => queryFor(event)
  Event.exists = async () => null
  t.after(() => {
    Event.findOne = originalFindOne
    Event.exists = originalExists
  })

  const res = response()
  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId },
      body: { ...details, title: 'Corrected title', status: 'Pending Approval' },
    },
    res,
    (error) => { throw error },
  )

  assert.equal(res.statusCode, 200)
  assert.equal(event.status, 'Pending Approval')
  assert.equal(event.title, 'Corrected title')
  assert.equal(event.approvedSnapshot.title, 'Published title')
})

test('decision notification persistence failure aborts the decision and audit write', async (t) => {
  const event = makeEvent()
  const mocks = installTransactionMocks(t, event, {
    notificationError: new Error('notification collection unavailable'),
  })
  const originalConsoleError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalConsoleError })

  const res = response()
  await decideEvent(
    {
      params: { id: eventId },
      user: { _id: adminId },
      body: { action: 'approve' },
    },
    res,
    (error) => { throw error },
  )

  assert.equal(res.statusCode, 503)
  assert.match(res.payload.message, /notification could not be saved/i)
  assert.equal(event.status, 'Pending Approval')
  assert.equal(event.saveCalls, 0)
  assert.equal(mocks.auditRecords.length, 0)
  assert.equal(mocks.notifications.length, 0)
})

test('audit persistence failure aborts the decision and organizer notification', async (t) => {
  const event = makeEvent()
  const mocks = installTransactionMocks(t, event, {
    auditError: new Error('audit collection unavailable'),
  })
  const originalConsoleError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalConsoleError })

  const res = response()
  await decideEvent(
    {
      params: { id: eventId },
      user: { _id: adminId },
      body: { action: 'approve' },
    },
    res,
    (error) => { throw error },
  )

  assert.equal(res.statusCode, 503)
  assert.match(res.payload.message, /audit entry could not be saved/i)
  assert.equal(event.status, 'Pending Approval')
  assert.equal(event.saveCalls, 0)
  assert.equal(mocks.auditRecords.length, 0)
  assert.equal(mocks.notifications.length, 0)
})

test('unavailable MongoDB transactions fail safely before committing a decision', async (t) => {
  const event = makeEvent()
  const originals = {
    startSession: mongoose.startSession,
    findOne: Event.findOne,
  }
  mongoose.startSession = async () => ({
    async withTransaction() {
      const error = new Error('Transaction numbers are only allowed on a replica set member or mongos')
      error.code = 20
      throw error
    },
    async endSession() {},
  })
  Event.findOne = () => queryFor(event)
  t.after(() => {
    mongoose.startSession = originals.startSession
    Event.findOne = originals.findOne
  })
  const originalConsoleError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalConsoleError })

  const res = response()
  await decideEvent(
    {
      params: { id: eventId },
      user: { _id: adminId },
      body: { action: 'approve' },
    },
    res,
    (error) => { throw error },
  )
  assert.equal(res.statusCode, 503)
  assert.equal(event.status, 'Pending Approval')
})
