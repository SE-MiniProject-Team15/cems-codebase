const mongoose = require('mongoose');
const Event = require('../models/Event');
const Feedback = require('../models/Feedback');

function sendError(res, status, message) {
  return res.status(status).json({ status: 'fail', message });
}

function eventDetails(event) {
  if (event.status !== 'Approved' && event.approvedSnapshot) {
    return event.approvedSnapshot;
  }
  return event;
}

function serializeFeedback(feedback) {
  return {
    rating: feedback.rating,
    comment: feedback.comment || '',
    createdAt: feedback.createdAt,
  };
}

function summarizeFeedback(feedback) {
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingTotal = 0;

  for (const entry of feedback) {
    ratingDistribution[entry.rating] += 1;
    ratingTotal += entry.rating;
  }

  return {
    averageRating: feedback.length ? ratingTotal / feedback.length : 0,
    totalResponses: feedback.length,
    ratingDistribution,
    feedback: feedback.map(serializeFeedback),
  };
}

function isDuplicateFeedback(error) {
  return error?.code === 11000;
}

async function findEvent(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    sendError(res, 400, 'Invalid event ID');
    return null;
  }

  const event = await Event.findById(id);
  if (!event) {
    sendError(res, 404, 'Event not found');
    return null;
  }

  if (
    req.user.role === 'Organizer' &&
    String(event.organizer) !== String(req.user._id)
  ) {
    sendError(res, 403, 'You do not have permission to view this event feedback.');
    return null;
  }

  return event;
}

async function submitFeedback(req, res, next) {
  try {
    const event = await findEvent(req, res);
    if (!event) return;

    const rating = req.body?.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendError(res, 400, 'Rating must be an integer between 1 and 5');
    }

    const comment = req.body?.comment;
    if (
      comment !== undefined &&
      (typeof comment !== 'string' || comment.length > 1000)
    ) {
      return sendError(res, 400, 'Comment must be 1,000 characters or fewer');
    }

    const details = eventDetails(event);
    const endTime = new Date(details.endDateTime);
    if (!Number.isFinite(endTime.getTime()) || endTime >= new Date()) {
      return sendError(res, 400, 'Feedback is available after the event ends');
    }

    const registration = (event.registrations || []).find((entry) =>
      String(entry.student) === String(req.user._id) &&
      entry.status === 'Registered'
    );
    if (!registration?.attendedAt) {
      return sendError(
        res,
        403,
        'Feedback is available only to students marked Present'
      );
    }

    const existing = await Feedback.findOne({
      event: event._id,
      student: req.user._id,
    });
    if (existing) {
      return sendError(res, 409, 'Feedback has already been submitted for this event');
    }

    try {
      const feedback = await Feedback.create({
        event: event._id,
        student: req.user._id,
        rating,
        ...(comment !== undefined && { comment: comment.trim() }),
      });

      return res.status(201).json({
        status: 'success',
        message: 'Feedback submitted successfully.',
        data: { feedback },
      });
    } catch (error) {
      if (isDuplicateFeedback(error)) {
        return sendError(
          res,
          409,
          'Feedback has already been submitted for this event'
        );
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

async function getMyFeedback(req, res, next) {
  try {
    const event = await findEvent(req, res);
    if (!event) return;

    const feedback = await Feedback.findOne({
      event: event._id,
      student: req.user._id,
    });

    return res.status(200).json({
      status: 'success',
      data: { feedback: feedback || null },
    });
  } catch (error) {
    return next(error);
  }
}

async function getEventFeedback(req, res, next) {
  try {
    const event = await findEvent(req, res);
    if (!event) return;

    const feedback = await Feedback.find({ event: event._id });
    return res.status(200).json({
      status: 'success',
      data: {
        event: {
          id: String(event._id),
          title: eventDetails(event).title,
        },
        ...summarizeFeedback(feedback),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminFeedbackSummary(req, res, next) {
  try {
    const events = await Event.find({});
    const eventIds = events.map((event) => event._id);
    const feedback = eventIds.length
      ? await Feedback.find({ event: { $in: eventIds } })
      : [];
    const feedbackByEvent = new Map();

    for (const entry of feedback) {
      const eventId = String(entry.event);
      if (!feedbackByEvent.has(eventId)) feedbackByEvent.set(eventId, []);
      feedbackByEvent.get(eventId).push(entry);
    }

    const summaries = events.map((event) => ({
      id: String(event._id),
      title: eventDetails(event).title,
      endDateTime: eventDetails(event).endDateTime,
      ...summarizeFeedback(feedbackByEvent.get(String(event._id)) || []),
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        events: summaries,
        totalResponses: feedback.length,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function listEligibleFeedbackEvents(req, res, next) {
  try {
    const events = await Event.find({
      status: { $ne: 'Cancelled' },
      registrations: {
        $elemMatch: {
          student: req.user._id,
          status: 'Registered',
          attendedAt: { $ne: null },
        },
      },
    });
    const now = new Date();
    const eligibleEvents = events
      .filter((event) => {
        const endTime = new Date(eventDetails(event).endDateTime);
        return Number.isFinite(endTime.getTime()) && endTime < now;
      })
      .map((event) => ({
        id: String(event._id),
        title: eventDetails(event).title,
        endDateTime: eventDetails(event).endDateTime,
      }));

    return res.status(200).json({
      status: 'success',
      results: eligibleEvents.length,
      data: { events: eligibleEvents },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitFeedback,
  getMyFeedback,
  getEventFeedback,
  getAdminFeedbackSummary,
  listEligibleFeedbackEvents,
};
