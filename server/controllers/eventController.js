
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const EventAuditLog = require('../models/EventAuditLog');
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
const MIN_DECISION_COMMENT_LENGTH = 10;
const MAX_DECISION_COMMENT_LENGTH = 1000;

function eventDetails(source) {
  const details = {};

  for (const field of DETAIL_FIELDS) {
    details[field] = source[field];
  }

  return details;
}

function reviewEventDetails(event) {
  const source = typeof event.toObject === 'function' ? event.toObject() : event;

  return {
    _id: source._id,
    organizer: source.organizer,
    status: source.status,
    ...eventDetails(source),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function sendError(res, status, message) {
  return res.status(status).json({ status: 'fail', message });
}

class WorkflowError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class NotificationPersistenceError extends Error {
  constructor(cause) {
    super('Could not persist the organizer decision notification', { cause });
    this.name = 'NotificationPersistenceError';
  }
}

class AuditPersistenceError extends Error {
  constructor(cause) {
    super('Could not persist the event decision audit record', { cause });
    this.name = 'AuditPersistenceError';
  }
}

function isTransactionUnavailable(error) {
  return error.code === 20 ||
    error.codeName === 'IllegalOperation' ||
    /transactions are not supported|transaction numbers are only allowed|replica set|mongos/i.test(error.message);
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
  let inAppNotificationsSaved = true;

  try {
    if (notifications.length) {
      await Notification.insertMany(notifications, { ordered: false });
    }
  } catch (error) {
    inAppNotificationsSaved = false;
    console.error('In-app notification persistence failed:', error.name || 'Error');
  }

  for (const email of emails) {
    try {
      await sendNotificationEmail(
        email.to,
        email.subject,
        email.message
      );
    } catch (error) {
      console.error('Notification email failed:', error.name || 'Error');
    }
  }

  return { inAppNotificationsSaved };
}

async function createEvent(req, res, next) {
  try {
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return sendError(res, 400, 'Event details must be a JSON object');
    }

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
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return sendError(res, 400, 'Event details must be a JSON object');
    }

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

    if (event.status === 'Pending Approval') {
      return sendError(res, 400, 'Events pending approval cannot be edited');
    }

    const nextDetails = {
      ...eventDetails(event.toObject()),
      ...req.body,
    };

    const wasApproved = event.status === 'Approved';
    const hasPublishedVersion = wasApproved || Boolean(event.approvedSnapshot);
    const isDraft = !wasApproved && req.body.status === 'Draft';

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

    let notificationResult;
    if (hasPublishedVersion && event.registeredStudents.length > 0) {
      const message =
        `"${previousTitle}" has been updated and is awaiting reapproval.`;

      const notifications = event.registeredStudents.map((studentId) => ({
        recipient: studentId,
        event: event._id,
        type: 'EVENT_UPDATED',
        title: 'Event updated',
        message,
      }));

      notificationResult = await notifyUsers(notifications);
    }

    const responsePayload = {
      status: 'success',
      data: { event },
    };

    if (notificationResult) {
      responsePayload.message = notificationResult.inAppNotificationsSaved
        ? 'Event updated and in-app notifications saved.'
        : 'Event updated, but in-app notifications could not be saved.';
      responsePayload.data.notificationSaved =
        notificationResult.inAppNotificationsSaved;
    }

    return res.json(responsePayload);
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

    let notificationResult;
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

      notificationResult = await notifyUsers(notifications);
    }

    return res.json({
      status: 'success',
      message: !wasApproved
        ? 'Event cancelled successfully.'
        : event.registeredStudents.length === 0
          ? 'Event cancelled; there were no registered students to notify.'
          : notificationResult.inAppNotificationsSaved
            ? 'Event cancelled and in-app notifications saved.'
            : 'Event cancelled, but in-app notifications could not be saved.',
      data: { event },
    });
  } catch (error) {
    return next(error);
  }
}

async function listPendingEvents(req, res, next) {
  try {
    const events = await Event.find({ status: 'Pending Approval' })
      .sort({ updatedAt: -1 });

    return res.json({
      status: 'success',
      results: events.length,
      data: { events: events.map(reviewEventDetails) },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPendingEventDetails(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, 'Invalid event ID');
  }

  try {
    const event = await Event.findOne({
      _id: req.params.id,
      status: 'Pending Approval',
    });

    if (!event) {
      return sendError(res, 404, 'Pending event not found');
    }

    return res.json({
      status: 'success',
      data: { event: reviewEventDetails(event) },
    });
  } catch (error) {
    return next(error);
  }
}

async function decideEvent(req, res, next) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    return sendError(res, 400, 'Decision payload must be a JSON object');
  }

  const { action } = req.body;
  const validActions = ['approve', 'reject', 'request_changes'];

  if (!validActions.includes(action)) {
    return sendError(
      res,
      400,
      'Action must be approve, reject, or request_changes'
    );
  }

  const allowedFields = new Set([
    'action',
    ...(action === 'reject' ? ['reason'] : []),
    ...(action === 'request_changes' ? ['comments'] : []),
  ]);
  if (Object.keys(req.body).some((field) => !allowedFields.has(field))) {
    return sendError(res, 400, 'Decision payload contains unsupported fields');
  }

  const commentField = action === 'reject' ? 'reason' : 'comments';
  const comment = req.body[commentField];
  if (comment !== undefined && typeof comment !== 'string') {
    return sendError(res, 400, 'Decision comments must be text');
  }

  const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
  if (
    action !== 'approve' &&
    normalizedComment.length < MIN_DECISION_COMMENT_LENGTH
  ) {
    return sendError(
      res,
      400,
      `${commentField} must be at least ${MIN_DECISION_COMMENT_LENGTH} characters`
    );
  }
  if (normalizedComment.length > MAX_DECISION_COMMENT_LENGTH) {
    return sendError(
      res,
      400,
      `Decision comments cannot exceed ${MAX_DECISION_COMMENT_LENGTH} characters`
    );
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, 'Invalid event ID');
  }

  const actionValues = {
    approve: { status: 'Approved', audit: 'APPROVE', title: 'Event approved' },
    reject: { status: 'Rejected', audit: 'REJECT', title: 'Event rejected' },
    request_changes: {
      status: 'Changes Requested',
      audit: 'REQUEST_CHANGES',
      title: 'Changes requested for event',
    },
  };
  const decision = actionValues[action];
  let session;

  try {
    session = await mongoose.startSession();
    let result;

    await session.withTransaction(async () => {
      const event = await Event.findOne({
        _id: req.params.id,
        status: 'Pending Approval',
      }).session(session);

      if (!event) {
        const existingEvent = await Event.findOne({
          _id: req.params.id,
        }).session(session);

        if (!existingEvent) {
          throw new WorkflowError(404, 'Event not found');
        }

        throw new WorkflowError(
          409,
          'Only pending events can receive a decision'
        );
      }

      if (action === 'approve') {
        const errors = validateEventDetails(event.toObject());
        if (errors.length) {
          throw new WorkflowError(400, errors.join('; '));
        }

        const conflict = await hasVenueConflict(event.toObject(), event._id);
        if (conflict) {
          throw new WorkflowError(
            409,
            'This venue already has an overlapping approved event'
          );
        }

        event.approvedSnapshot = eventDetails(event.toObject());
      }

      event.status = decision.status;
      await event.save({ session });

      const auditRecord = {
        administrator: req.user._id,
        event: event._id,
        action: decision.audit,
        ...(normalizedComment && { comment: normalizedComment }),
      };
      let auditLog;
      try {
        [auditLog] = await EventAuditLog.create([auditRecord], { session });
      } catch (error) {
        throw new AuditPersistenceError(error);
      }

      const notificationMessage = normalizedComment
        ? `"${event.title}" ${decision.status.toLowerCase()}. ${normalizedComment}`
        : `"${event.title}" has been approved.`;
      let notification;
      try {
        [notification] = await Notification.create([{
          recipient: event.organizer,
          event: event._id,
          type: 'APPROVAL_DECISION',
          title: decision.title,
          message: notificationMessage,
        }], { session });
      } catch (error) {
        throw new NotificationPersistenceError(error);
      }

      result = { event, auditLog, notification };
    });

    return res.json({
      status: 'success',
      message: 'Decision recorded and organizer notified.',
      data: {
        event: reviewEventDetails(result.event),
        auditLog: result.auditLog,
        notificationSaved: true,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      return sendError(res, error.statusCode, error.message);
    }

    if (isTransactionUnavailable(error)) {
      console.error(
        'Approval decision requires MongoDB transaction support:',
        error.name || 'Error'
      );
      return sendError(
        res,
        503,
        'Approval decision was not recorded because MongoDB transactions are unavailable'
      );
    }

    if (error instanceof NotificationPersistenceError) {
      console.error(
        'Approval decision rolled back because notification persistence failed:',
        error.cause?.name || error.name || 'Error'
      );
      return sendError(
        res,
        503,
        'Approval decision was not recorded because the organizer notification could not be saved'
      );
    }

    if (error instanceof AuditPersistenceError) {
      console.error(
        'Approval decision rolled back because audit persistence failed:',
        error.cause?.name || error.name || 'Error'
      );
      return sendError(
        res,
        503,
        'Approval decision was not recorded because the audit entry could not be saved'
      );
    }

    return next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

function approveEvent(req, res, next) {
  return decideEvent({
    params: req.params,
    user: req.user,
    body: { action: 'approve' },
  }, res, next);
}

async function listPublicEvents(req, res, next) {
  try {
    const events = await Event.find({
      $or: [
        { status: 'Approved' },
        {
          status: {
            $in: [
              'Pending Approval',
              'Rejected',
              'Changes Requested',
              'Draft',
            ],
          },
          approvedSnapshot: { $exists: true, $ne: null },
        },
      ],
    }).sort({ createdAt: -1 });

    const publicEvents = events.map((event) => {
      const item = event.toObject();
      const publicDetails =
        item.status !== 'Approved' && item.approvedSnapshot
          ? item.approvedSnapshot
          : item;

      return {
        ...eventDetails(publicDetails),
        _id: item._id,
        status: 'Approved',
      };
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
  listPendingEvents,
  getPendingEventDetails,
  decideEvent,
  listPublicEvents,
};
