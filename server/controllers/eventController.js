
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { sendNotificationEmail } = require('../services/notificationService');

const DETAIL_FIELDS = [
  'title',
  'category',
  'description',
  'venue',
  'department',
  'startDateTime',
  'endDateTime',
  'capacity',
  'bannerUrl',
  'registrationDeadline',
];

function eventDetails(source) {
  return Object.fromEntries(
    DETAIL_FIELDS.map((field) => [field, source[field]])
  );
}

const PUBLIC_EVENT_PROJECTION = [
  '_id',
  ...DETAIL_FIELDS,
  'organizer',
  'status',
  'approvedSnapshot',
].join(' ');

function publicEventSnapshot(snapshot) {
  if (!snapshot) return undefined;

  const source = typeof snapshot.toObject === 'function'
    ? snapshot.toObject()
    : snapshot;

  return eventDetails(source);
}

function serializePublicEvent(event) {
  const item = event.toObject();
  const approvedSnapshot = publicEventSnapshot(item.approvedSnapshot);
  const useSnapshot = item.status === 'Pending Approval' &&
    approvedSnapshot;

  return {
    _id: item._id,
    ...eventDetails(useSnapshot || item),
    organizer: item.organizer?._id ?? item.organizer,
    status: useSnapshot ? 'Approved' : item.status,
    ...(approvedSnapshot ? { approvedSnapshot } : {}),
  };
}

function sendError(res, status, message) {
  return res.status(status).json({
    status: 'fail',
    message,
  });
}

function validateEventDetails(body, allowDraft = false) {
  const errors = [];

  for (const field of DETAIL_FIELDS) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ''
    ) {
      if (!allowDraft) errors.push(`${field} is required`);
    }
  }

  if (allowDraft) return errors;

  const start = new Date(body.startDateTime);
  const end = new Date(body.endDateTime);
  const deadline = new Date(body.registrationDeadline);

  if (
    [start, end, deadline].some((date) =>
      Number.isNaN(date.getTime())
    )
  ) {
    errors.push(
      'Start time, end time, and registration deadline must be valid dates'
    );
    return errors;
  }

  const now = new Date();

  if (start <= now) {
    errors.push('Event date and time must be in the future');
  }

  if (end <= start) {
    errors.push('Event end time must be after its start time');
  }

  if (deadline >= start) {
    errors.push('Registration deadline must be before the event starts');
  }

  if (deadline <= now) {
    errors.push('Registration deadline must be in the future');
  }

  if (
    !Number.isInteger(Number(body.capacity)) ||
    Number(body.capacity) < 1
  ) {
    errors.push('Capacity must be a positive whole number');
  }

  for (const field of [
    'title',
    'category',
    'description',
    'venue',
    'department',
    'bannerUrl',
  ]) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  return errors;
}

function escapeRegex(value) {
  let escaped = '';

  for (const character of value) {
    if ('\\^$.*+?()[]{}|'.includes(character)) {
      escaped += '\\';
    }

    escaped += character;
  }

  return escaped;
}

async function hasVenueConflict(details, excludeId) {
  const venue = String(details.venue || '').trim();

  if (
    !venue ||
    !details.startDateTime ||
    !details.endDateTime
  ) {
    return false;
  }

  const venuePattern = new RegExp(
    '^' + escapeRegex(venue) + '$',
    'i'
  );

  const query = {
    status: 'Approved',
    venue: venuePattern,
    startDateTime: {
      $lt: new Date(details.endDateTime),
    },
    endDateTime: {
      $gt: new Date(details.startDateTime),
    },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Event.exists(query);
}

async function notifyUsers(notifications, emails = []) {
  try {
    if (notifications.length) {
      await Notification.insertMany(notifications, {
        ordered: false,
      });
    }
  } catch (error) {
    console.error(
      'In-app notification creation failed:',
      error.message
    );
  }

  for (const email of emails) {
    try {
      await sendNotificationEmail(
        email.to,
        email.subject,
        email.message
      );
    } catch (error) {
      console.error(
        'Notification email failed:',
        error.message
      );
    }
  }
}

async function createEvent(req, res, next) {
  try {
    const isDraft = req.body.status === 'Draft';
    const errors = validateEventDetails(req.body, isDraft);

    if (errors.length) {
      return sendError(res, 400, errors.join('; '));
    }

    if (
      !isDraft &&
      await hasVenueConflict(req.body)
    ) {
      return sendError(
        res,
        409,
        'This venue already has an overlapping approved event'
      );
    }

    const event = await Event.create({
      ...eventDetails(req.body),
      organizer: req.user._id,
      status: isDraft ? 'Draft' : 'Pending Approval',
    });

    return res.status(201).json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    return next(error);
  }
}

async function listMyEvents(req, res, next) {
  try {
    const events = await Event.find({
      organizer: req.user._id,
    }).sort({ updatedAt: -1 });

    return res.json({
      status: 'success',
      data: { events },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateEvent(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, 'Invalid event ID');
    }

    const event = await Event.findOne({
      _id: req.params.id,
      organizer: req.user._id,
    });

    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    if (event.status === 'Cancelled') {
      return sendError(
        res,
        400,
        'Cancelled events cannot be edited'
      );
    }

    const nextDetails = {
      ...eventDetails(event.toObject()),
      ...req.body,
    };

    const isDraft =
      req.body.status === 'Draft' ||
      (
        req.body.status === undefined &&
        event.status === 'Draft'
      );

    const errors = validateEventDetails(
      nextDetails,
      isDraft
    );

    if (errors.length) {
      return sendError(res, 400, errors.join('; '));
    }

    if (
      !isDraft &&
      await hasVenueConflict(nextDetails, event._id)
    ) {
      return sendError(
        res,
        409,
        'This venue already has an overlapping approved event'
      );
    }

    const wasApproved = event.status === 'Approved';
    const previousTitle = event.title;

    if (wasApproved && !event.approvedSnapshot) {
      event.approvedSnapshot = eventDetails(
        event.toObject()
      );
    }

    for (const field of DETAIL_FIELDS) {
      if (nextDetails[field] !== undefined) {
        event[field] = nextDetails[field];
      }
    }

    event.status = isDraft ? 'Draft' : 'Pending Approval';

    await event.save();

    if (wasApproved && event.registeredStudents.length) {
      const notifications = event.registeredStudents.map(
        (studentId) => ({
          recipient: studentId,
          event: event._id,
          type: 'EVENT_UPDATED',
          title: 'Event updated',
          message:
            `"${previousTitle}" has been updated and is awaiting reapproval.`,
        })
      );

      await notifyUsers(notifications);
    }

    return res.json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    return next(error);
  }
}

async function cancelEvent(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, 'Invalid event ID');
    }

    const event = await Event.findOne({
      _id: req.params.id,
      organizer: req.user._id,
    });

    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    if (event.status === 'Cancelled') {
      return sendError(
        res,
        400,
        'Event is already cancelled'
      );
    }

    const wasApproved = event.status === 'Approved';

    event.status = 'Cancelled';
    await event.save();

    if (wasApproved && event.registeredStudents.length) {
      const notifications = event.registeredStudents.map(
        (studentId) => ({
          recipient: studentId,
          event: event._id,
          type: 'EVENT_CANCELLED',
          title: 'Event cancelled',
          message:
            `"${event.title}" has been cancelled by the organizer.`,
        })
      );

      await notifyUsers(notifications);
    }

    return res.json({
      status: 'success',
      message: wasApproved
        ? 'Event cancelled. Notification delivery was attempted.'
        : 'Event cancelled successfully.',
      data: { event },
    });
  } catch (error) {
    return next(error);
  }
}

async function approveEvent(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, 'Invalid event ID');
    }

    const event = await Event.findById(req.params.id);

    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    if (event.status !== 'Pending Approval') {
      return sendError(
        res,
        400,
        'Only pending events can be approved'
      );
    }

    const errors = validateEventDetails(event.toObject());

    if (errors.length) {
      return sendError(res, 400, errors.join('; '));
    }

    if (
      await hasVenueConflict(event.toObject(), event._id)
    ) {
      return sendError(
        res,
        409,
        'This venue already has an overlapping approved event'
      );
    }

    event.status = 'Approved';
    event.approvedSnapshot = eventDetails(
      event.toObject()
    );

    await event.save();

    await notifyUsers([
      {
        recipient: event.organizer,
        event: event._id,
        type: 'APPROVAL_DECISION',
        title: 'Event approved',
        message: `"${event.title}" has been approved.`,
      },
    ]);

    return res.json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    return next(error);
  }
}

const PUBLIC_EVENT_FILTER = {
  $or: [
    { status: 'Approved' },
    {
      status: 'Pending Approval',
      approvedSnapshot: {
        $exists: true,
        $ne: null,
      },
    },
  ],
};

async function listPublicEvents(req, res, next) {
  try {
    const events = await Event.find(
      PUBLIC_EVENT_FILTER
    ).select(PUBLIC_EVENT_PROJECTION).sort({ createdAt: -1 });
    const publicEvents = events.map(serializePublicEvent);

    return res.status(200).json({
      status: 'success',
      results: publicEvents.length,
      data: { events: publicEvents },
    });
  } catch (error) {
    return next(error);
  }
}

function readString(value, field, maxLength) {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    value.length > maxLength
  ) {
    const error = new Error(`${field} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  return value.trim();
}

function readDate(value, field, endOfDay = false) {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    const error = new Error(
      `${field} must be a valid date`
    );
    error.statusCode = 400;
    throw error;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error(
      `${field} must be a valid date`
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    endOfDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

function readPage(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    const error = new Error(
      'Page must be a positive integer'
    );
    error.statusCode = 400;
    throw error;
  }

  return page;
}

function serializeEvent(item) {
  const registrationCount =
    item.registrationCount ??
    (
      Array.isArray(item.registeredStudents)
        ? item.registeredStudents.length
        : 0
    );

  return {
    id: String(item._id),
    title: item.title,
    category: item.category,
    description: item.description,
    venue: item.venue,
    department: item.department,
    startDateTime: item.startDateTime,
    endDateTime: item.endDateTime,
    registrationDeadline: item.registrationDeadline,
    capacity: item.capacity,
    registrationCount,
    remainingSeats: Math.max(
      0,
      (Number(item.capacity) || 0) - registrationCount
    ),
    bannerUrl: item.bannerUrl,
  };
}

async function listEvents(req, res, next) {
  try {
    const search = readString(req.query.q, 'Search', 100);
    const category = readString(
      req.query.category,
      'Category',
      80
    );
    const venue = readString(
      req.query.venue,
      'Venue',
      160
    );
    const department = readString(
      req.query.department,
      'Department',
      120
    );

    const from = readDate(req.query.dateFrom, 'dateFrom');
    const to = readDate(req.query.dateTo, 'dateTo', true);
    const page = readPage(req.query.page, 1);
    const limit = Math.min(
      readPage(req.query.limit, 24),
      50
    );
    const sort = req.query.sort;

    if (from && to && from > to) {
      const error = new Error(
        'dateFrom must be before dateTo'
      );
      error.statusCode = 400;
      throw error;
    }

    if (
      sort !== undefined &&
      !['date', 'popular'].includes(sort)
    ) {
      const error = new Error(
        'Sort must be date or popular'
      );
      error.statusCode = 400;
      throw error;
    }

    const useSnapshot = {
      $and: [
        { $eq: ['$status', 'Pending Approval'] },
        {
          $ne: [
            { $ifNull: ['$approvedSnapshot', null] },
            null,
          ],
        },
      ],
    };

    const pipeline = [
      { $match: PUBLIC_EVENT_FILTER },
      {
        $set: {
          title: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.title',
              '$title',
            ],
          },
          category: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.category',
              '$category',
            ],
          },
          description: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.description',
              '$description',
            ],
          },
          venue: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.venue',
              '$venue',
            ],
          },
          department: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.department',
              '$department',
            ],
          },
          startDateTime: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.startDateTime',
              '$startDateTime',
            ],
          },
          endDateTime: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.endDateTime',
              '$endDateTime',
            ],
          },
          registrationDeadline: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.registrationDeadline',
              '$registrationDeadline',
            ],
          },
          capacity: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.capacity',
              '$capacity',
            ],
          },
          bannerUrl: {
            $cond: [
              useSnapshot,
              '$approvedSnapshot.bannerUrl',
              '$bannerUrl',
            ],
          },
          registrationCount: {
            $size: {
              $ifNull: ['$registeredStudents', []],
            },
          },
        },
      },
    ];

    const filters = {};

    if (search) {
      const pattern = new RegExp(
        escapeRegex(search),
        'i'
      );

      filters.$or = [
        { title: pattern },
        { description: pattern },
      ];
    }

    if (category) {
      filters.category = new RegExp(
        `^${escapeRegex(category)}$`,
        'i'
      );
    }

    if (venue) {
      filters.venue = new RegExp(
        `^${escapeRegex(venue)}$`,
        'i'
      );
    }

    if (department) {
      filters.department = new RegExp(
        `^${escapeRegex(department)}$`,
        'i'
      );
    }

    const startDate = {};

    if (from) startDate.$gte = from;
    if (to) startDate.$lte = to;

    if (!from && !to) {
      startDate.$gte = new Date();
    }

    filters.startDateTime = startDate;

    pipeline.push({ $match: filters });

    const ordering =
      sort === 'popular'
        ? {
            registrationCount: -1,
            startDateTime: 1,
          }
        : { startDateTime: 1 };

    pipeline.push({
      $facet: {
        events: [
          { $sort: ordering },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              title: 1,
              category: 1,
              description: 1,
              venue: 1,
              department: 1,
              startDateTime: 1,
              endDateTime: 1,
              registrationDeadline: 1,
              capacity: 1,
              registrationCount: 1,
              bannerUrl: 1,
            },
          },
        ],
        metadata: [{ $count: 'total' }],
      },
    });

    const [result] = await Event.aggregate(pipeline);
    const total = result.metadata[0]?.total || 0;

    return res.json({
      status: 'success',
      data: {
        events: result.events.map(serializeEvent),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getEvent(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.eventId)) {
      return sendError(res, 404, 'Event not found');
    }

    const [event] = await Event.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(
            req.params.eventId
          ),
          ...PUBLIC_EVENT_FILTER,
        },
      },
      {
        $set: {
          title: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.title',
              '$title',
            ],
          },
          category: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.category',
              '$category',
            ],
          },
          description: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.description',
              '$description',
            ],
          },
          venue: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.venue',
              '$venue',
            ],
          },
          department: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.department',
              '$department',
            ],
          },
          startDateTime: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.startDateTime',
              '$startDateTime',
            ],
          },
          endDateTime: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.endDateTime',
              '$endDateTime',
            ],
          },
          registrationDeadline: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.registrationDeadline',
              '$registrationDeadline',
            ],
          },
          capacity: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.capacity',
              '$capacity',
            ],
          },
          bannerUrl: {
            $cond: [
              { $eq: ['$status', 'Pending Approval'] },
              '$approvedSnapshot.bannerUrl',
              '$bannerUrl',
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          category: 1,
          description: 1,
          venue: 1,
          department: 1,
          startDateTime: 1,
          endDateTime: 1,
          registrationDeadline: 1,
          capacity: 1,
          registeredStudents: 1,
          bannerUrl: 1,
        },
      },
    ]);

    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    return res.json({
      status: 'success',
      data: {
        event: serializeEvent(event),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createEvent,
  listMyEvents,
  updateEvent,
  cancelEvent,
  approveEvent,
  listPublicEvents,
  listEvents,
  getEvent,
};
