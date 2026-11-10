const test = require('node:test')
const assert = require('node:assert/strict')
const Notification = require('../models/Notification')
const router = require('../routes/notificationRoutes')

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function readHandler() {
  return router.stack.find((layer) => layer.route?.path === '/:id/read')
    .route.stack[0].handle
}

function listHandler() {
  return router.stack.find((layer) => layer.route?.path === '/')
    .route.stack[0].handle
}

test('notification listing is scoped to the authenticated recipient', async (t) => {
  const originalFind = Notification.find
  let query
  let ordering
  const notifications = [{ _id: 'notice-id', read: false }]
  Notification.find = (filter) => {
    query = filter
    return { sort: async (sort) => { ordering = sort; return notifications } }
  }
  t.after(() => { Notification.find = originalFind })

  const res = response()
  await listHandler()(
    { user: { _id: 'recipient-id' } },
    res,
    (error) => { throw error },
  )

  assert.deepEqual(query, { recipient: 'recipient-id' })
  assert.deepEqual(ordering, { createdAt: -1, _id: -1 })
  assert.deepEqual(res.payload.data.notifications, notifications)
  assert.equal(res.payload.data.notifications[0].read, false)
})

test('mark-read rejects malformed notification IDs before querying', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate
  let queried = false
  Notification.findOneAndUpdate = async () => {
    queried = true
    return null
  }
  t.after(() => { Notification.findOneAndUpdate = originalFindOneAndUpdate })

  const res = response()
  await readHandler()(
    { params: { id: 'not-an-object-id' }, user: { _id: 'recipient-id' } },
    res,
    (error) => { throw error },
  )

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.message, 'Invalid notification ID')
  assert.equal(queried, false)
})

test('mark-read query remains scoped to the authenticated recipient', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate
  let query
  let options
  const notification = { _id: 'notification-id', read: true }
  Notification.findOneAndUpdate = async (filter, update, queryOptions) => {
    query = filter
    options = queryOptions
    return notification
  }
  t.after(() => { Notification.findOneAndUpdate = originalFindOneAndUpdate })

  const res = response()
  await readHandler()(
    {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { _id: 'recipient-id' },
    },
    res,
    (error) => { throw error },
  )

  assert.equal(query._id, '507f1f77bcf86cd799439011')
  assert.equal(query.recipient, 'recipient-id')
  assert.deepEqual(options, { returnDocument: 'after' })
  assert.equal(res.payload.data.notification, notification)
})

test('mark-read does not disclose another recipient notification', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate
  let query
  Notification.findOneAndUpdate = async (filter) => {
    query = filter
    return null
  }
  t.after(() => { Notification.findOneAndUpdate = originalFindOneAndUpdate })

  const res = response()
  await readHandler()(
    {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { _id: 'different-recipient-id' },
    },
    res,
    (error) => { throw error },
  )

  assert.deepEqual(query, {
    _id: '507f1f77bcf86cd799439011',
    recipient: 'different-recipient-id',
  })
  assert.equal(res.statusCode, 404)
})
