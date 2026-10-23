
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
  const details = {};

  for (const field of DETAIL_FIELDS) {
    details[field] = source[field];
  }

  return details;
}

function sendError(res, status, message) {
  return res.status(status).json({ status: 'fail', message });
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

  if ([start, end, deadline].some((date) => Number.isNaN(date.getTime()))) {
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

  if (!Number.isInteger(Number(body.capacity)) || Number(body.capacity) < 1) {
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

async function hasVenueConflict(details, excludeId) {
  const venue = String(details.venue || '').trim();

  if (!venue || !details.startDateTime || !details.endDateTime) {
    return false;
  }

  const venuePattern = new RegExp(
    `^${venue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    'i'
  );

  const query = {
    status: 'Approved',
    venue: venuePattern,
    startDateTime: { $lt: new Date(details.endDateTime) },
    endDateTime: { $gt: new Date(details.startDateTime) },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Event.exists(query);
}

// Notification errors must not undo the event action.
async function notifyUsers(notifications, emails = []) {
  try {
    if (notifications.length) {
      await Notification.insertMany(notifications, { ordered: false });
    }
  } catch (error) {
    console.error('In-app notification creation failed:', error.message);
  }

  for (const email of emails) {
    try {
      await sendNotificationEmail(
        email.to,
        email.subject,
        email.message
      );
    } catch (error) {
      console.error('Notification email failed:', error.message);
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

    if (!isDraft) {
      const conflict = await hasVenueConflict(req.body);

      if (conflict) {
        return sendError(
          res,
          409,
          'This venue already has an overlapping approved event'
        );
      }
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
    const events = await Event.find({ organizer: req.user._id })
      .sort({ updatedAt: -1 });

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
      return sendError(res, 400, 'Cancelled events cannot be edited');
    }

    const nextDetails = {
      ...eventDetails(event.toObject()),
      ...req.body,
    };

    const isDraft =
      req.body.status === 'Draft' || event.status === 'Draft';

    const errors = validateEventDetails(nextDetails, isDraft);

    if (errors.length) {
      return sendError(res, 400, errors.join('; '));
    }

    if (!isDraft) {
      const conflict = await hasVenueConflict(nextDetails, event._id);

      if (conflict) {
        return sendError(
          res,
          409,
          'This venue already has an overlapping approved event'
        );
      }
    }

    const wasApproved = event.status === 'Approved';
    const previousTitle = event.title;

    // Preserve the previously approved details for the public listing.
    if (wasApproved && !event.approvedSnapshot) {
      event.approvedSnapshot = eventDetails(event.toObject());
    }

    for (const field of DETAIL_FIELDS) {
      if (nextDetails[field] !== undefined) {
        event[field] = nextDetails[field];
      }
    }

    event.status = isDraft ? 'Draft' : 'Pending Approval';
    await event.save();

    if (wasApproved && event.registeredStudents.length > 0) {
      const message =
        `"${previousTitle}" has been updated and is awaiting reapproval.`;

      const notifications = event.registeredStudents.map((studentId) => ({
        recipient: studentId,
        event: event._id,
        type: 'EVENT_UPDATED',
        title: 'Event updated',
        message,
      }));

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
      return sendError(res, 400, 'Event is already cancelled');
    }

    const wasApproved = event.status === 'Approved';

    event.status = 'Cancelled';
    await event.save();

    if (wasApproved && event.registeredStudents.length > 0) {
      const message =
        `"${event.title}" has been cancelled by the organizer.`;

      const notifications = event.registeredStudents.map((studentId) => ({
        recipient: studentId,
        event: event._id,
        type: 'EVENT_CANCELLED',
        title: 'Event cancelled',
        message,
      }));

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

    const conflict = await hasVenueConflict(event.toObject(), event._id);

    if (conflict) {
      return sendError(
        res,
        409,
        'This venue already has an overlapping approved event'
      );
    }

    event.status = 'Approved';
    event.approvedSnapshot = eventDetails(event.toObject());

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

async function listPublicEvents(req, res, next) {
  try {
    const events = await Event.find({
      $or: [
        { status: 'Approved' },
        {
          status: 'Pending Approval',
          approvedSnapshot: { $exists: true, $ne: null },
        },
      ],
    }).sort({ createdAt: -1 });

    const publicEvents = events.map((event) => {
      const item = event.toObject();

      if (
        item.status === 'Pending Approval' &&
        item.approvedSnapshot
      ) {
        return {
          ...item,
          ...item.approvedSnapshot,
          _id: item._id,
          status: 'Approved',
        };
      }

      return item;
    });

    return res.status(200).json({
      status: 'success',
      results: publicEvents.length,
      data: { events: publicEvents },
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
};
