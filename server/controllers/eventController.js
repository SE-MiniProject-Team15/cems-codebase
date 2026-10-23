const mongoose = require('mongoose')
const Event = require('../models/Event')
function readString(value, field, maxLength) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    const error = new Error(field + ' is invalid')
    error.statusCode = 400
    throw error
  }
  return value.trim()
}
function readDate(value, field) {
  if (value === undefined || value === '') return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const error = new Error(field + ' must be a valid date')
    error.statusCode = 400
    throw error
  }
  return date
}
function readPage(value, fallback) {
  if (value === undefined) return fallback
  const page = Number(value)
  if (!Number.isInteger(page) || page < 1) {
    const error = new Error('Page must be a positive integer')
    error.statusCode = 400
    throw error
  }
  return page
}
function escapeRegex(value) {
  return value.replace(/[.*+?^{}()|[\]\\]/g, '\\$&')
}
function serializeEvent(event) {
  const item = event.toObject ? event.toObject() : event
  return {
    id: String(item._id),
    title: item.title,
    category: item.category,
    description: item.description,
    venue: item.venue,
    department: item.department,
    startAt: item.startAt,
    endAt: item.endAt,
    registrationDeadline: item.registrationDeadline,
    capacity: item.capacity,
    registrationCount: item.registrationCount,
    remainingSeats: Math.max(0, item.capacity - item.registrationCount),
    bannerUrl: item.bannerUrl,
  }
}
async function listEvents(req, res, next) {
  try {
    const { q, category, venue, department, dateFrom, dateTo, sort } = req.query
    const search = readString(q, 'Search', 100)
    const categoryFilter = readString(category, 'Category', 80)
    const venueFilter = readString(venue, 'Venue', 160)
    const departmentFilter = readString(department, 'Department', 120)
    const from = readDate(dateFrom, 'dateFrom')
    const to = readDate(dateTo, 'dateTo')
    const page = readPage(req.query.page, 1)
    const limit = Math.min(readPage(req.query.limit, 24), 50)
    if (from && to && from > to) {
      const error = new Error('dateFrom must be before dateTo')
      error.statusCode = 400
      throw error
    }
    if (sort !== undefined && !['date', 'popular'].includes(sort)) {
      const error = new Error('Sort must be date or popular')
      error.statusCode = 400
      throw error
    }
    const filter = { status: 'approved' }
    if (search) filter.$text = { $search: search }
    if (categoryFilter) filter.category = new RegExp('^' + escapeRegex(categoryFilter) + '$', 'i')
    if (venueFilter) filter.venue = new RegExp('^' + escapeRegex(venueFilter) + '$', 'i')
    if (departmentFilter) filter.department = new RegExp('^' + escapeRegex(departmentFilter) + '$', 'i')
    if (from || to) {
      filter.startAt = {}
      if (from) filter.startAt.$gte = from
      if (to) filter.startAt.$lte = to
    } else {
      filter.startAt = { $gte: new Date() }
    }
    const sortOrder = sort === 'popular' ? { registrationCount: -1, startAt: 1 } : { startAt: 1 }
    const [events, total] = await Promise.all([
      Event.find(filter).sort(sortOrder).skip((page - 1) * limit).limit(limit),
      Event.countDocuments(filter),
    ])
    return res.json({
      status: 'success',
      data: {
        events: events.map(serializeEvent),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (error) {
    return next(error)
  }
}
async function getEvent(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.eventId)) {
      return res.status(404).json({ status: 'fail', message: 'Event not found' })
    }
    const event = await Event.findOne({ _id: req.params.eventId, status: 'approved' })
    if (!event) {
      return res.status(404).json({ status: 'fail', message: 'Event not found' })
    }
    return res.json({ status: 'success', data: { event: serializeEvent(event) } })
  } catch (error) {
    return next(error)
  }
}
module.exports = { listEvents, getEvent }
