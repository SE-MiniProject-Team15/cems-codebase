const test = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const Event = require('../models/Event')
const EventAuditLog = require('../models/EventAuditLog')
const Notification = require('../models/Notification')
const { updateEvent, approveEvent, listPublicEvents } = require('../controllers/eventController')

const eventId = '507f1f77bcf86cd799439011'
const eventDetails = {
  title: 'Published event',
  category: 'Workshop',
  description: 'Event description',
  venue: 'Main Hall',
  department: 'Engineering',
  startDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  endDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  capacity: 50,
  bannerUrl: 'https://example.com/banner.png',
  registrationDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function mockEvent(overrides = {}) {
  const event = {
    ...eventDetails,
    _id: eventId,
    organizer: 'organizer-id',
    status: 'Draft',
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

  return event
}

test('organizers cannot edit pending events, even by submitting Draft status', async (t) => {
  const originalFindOne = Event.findOne
  const event = mockEvent({ status: 'Pending Approval' })
  Event.findOne = async () => event
  t.after(() => { Event.findOne = originalFindOne })

  const res = response()
  await updateEvent(
    { params: { id: eventId }, body: { title: 'Changed', status: 'Draft' }, user: { _id: 'organizer-id' } },
    res,
    (error) => { throw error },
  )

  assert.equal(res.statusCode, 400)
  assert.match(res.payload.message, /pending approval/i)
  assert.equal(event.title, eventDetails.title)
  assert.equal(event.saveCalls, 0)
})

test('saving edits to an approved event as a draft keeps its approved snapshot public', async (t) => {
  const originalFindOne = Event.findOne
  const originalExists = Event.exists
  const originalFind = Event.find
  const approvedSnapshot = { ...eventDetails }
  const event = mockEvent({
    status: 'Approved',
    approvedSnapshot,
    organizer: 'private-organizer-id',
    registeredStudents: ['private-student-id'],
  })
  Event.findOne = async () => event
  Event.exists = async () => null
  Event.find = () => ({ select: () => ({ sort: async () => [event] }) })
  t.after(() => {
    Event.findOne = originalFindOne
    Event.exists = originalExists
    Event.find = originalFind
  })

  const updateRes = response()
  await updateEvent(
    {
      params: { id: eventId },
      body: { title: 'Unapproved title', status: 'Draft' },
      user: { _id: 'organizer-id' },
    },
    updateRes,
    (error) => { throw error },
  )

  assert.equal(updateRes.statusCode, 200)
  assert.equal(event.status, 'Pending Approval')
  assert.equal(event.title, 'Unapproved title')
  assert.equal(event.approvedSnapshot.title, 'Published event')

  const publicRes = response()
  await listPublicEvents({}, publicRes, (error) => { throw error })

  assert.equal(publicRes.statusCode, 200)
  const publicEvent = publicRes.payload.data.events[0]
  assert.equal(publicEvent.status, 'Approved')
  assert.equal(publicEvent.title, 'Published event')
  assert.equal(publicEvent.organizer, 'private-organizer-id')
  assert.equal(publicEvent.registeredStudents, undefined)
  assert.equal(publicEvent.approvedSnapshot.title, 'Published event')
  for (const status of ['Rejected', 'Changes Requested', 'Draft']) {
    event.status = status
    const snapshotRes = response()
    await listPublicEvents({}, snapshotRes, (error) => { throw error })
    const published = snapshotRes.payload.data.events[0]
    assert.equal(published.status, 'Approved')
    assert.equal(published.title, 'Published event')
    assert.equal(published.registeredStudents, undefined)
    assert.equal(published.registrations, undefined)
  }
})

test('approval rolls back when its in-app notification could not be persisted', async (t) => {
  const originalStartSession = mongoose.startSession
  const originalFindOne = Event.findOne
  const originalExists = Event.exists
  const originalAuditCreate = EventAuditLog.create
  const originalNotificationCreate = Notification.create
  const originalConsoleError = console.error
  const event = mockEvent({
    status: 'Pending Approval',
    organizer: 'organizer-id',
  })
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      const originalStatus = event.status
      const originalSnapshot = event.approvedSnapshot
      try {
        await callback()
      } catch (error) {
        event.status = originalStatus
        event.approvedSnapshot = originalSnapshot
        throw error
      }
    },
    async endSession() {},
  })
  Event.findOne = () => ({ session: async () => event })
  Event.exists = async () => null
  EventAuditLog.create = async ([auditLog]) => [auditLog]
  Notification.create = async () => { throw new Error('notification store unavailable') }
  console.error = () => {}
  t.after(() => {
    mongoose.startSession = originalStartSession
    Event.findOne = originalFindOne
    Event.exists = originalExists
    EventAuditLog.create = originalAuditCreate
    Notification.create = originalNotificationCreate
    console.error = originalConsoleError
  })

  const res = response()
  await approveEvent({ params: { id: eventId }, user: { _id: 'admin-id' } }, res, (error) => { throw error })

  assert.equal(res.statusCode, 503)
  assert.match(res.payload.message, /could not be saved/i)
  assert.equal(event.status, 'Pending Approval')
})
