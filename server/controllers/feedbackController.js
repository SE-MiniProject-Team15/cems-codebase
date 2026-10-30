const mongoose = require('mongoose');
const Event = require('../models/Event');
const Feedback = require('../models/Feedback');

const MAX_COMMENT_LENGTH = 1000;

function sendError(res, status, message) {
  return res.status(status).json({ status: 'fail', message });
}

function serializeFeedback(feedback) {
  return {
    rating: feedback.rating,
    comment: feedback.comment,
    submittedAt: feedback.createdAt,
  };
}

function getStudentRegistration(event, studentId) {
  return event.registrations.find(
    (registration) =>
      String(registration.student?._id || registration.student) === String(studentId) &&
      registration.status === 'Registered' &&
      registration.attendanceStatus === 'Present'
  );
}

function isDuplicateKeyError(error) {
  return error.code === 11000;
}

async function submitFeedback(req, res, next) {
  const { eventId } = req.params;
  const { rating, comment = '' } = req.body || {};

  if (!mongoose.isValidObjectId(eventId)) {
    return sendError(res, 400, 'Invalid event ID');
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return sendError(res, 400, 'Rating must be a whole number from 1 to 5');
  }
  if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) {
    return sendError(res, 400, `Comment must be text no longer than ${MAX_COMMENT_LENGTH} characters`);
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    const publishedDetails = event.status === 'Pending Approval' && event.approvedSnapshot
      ? event.approvedSnapshot
      : event;
    const endTime = new Date(publishedDetails.endDateTime);
    if (!Number.isFinite(endTime.getTime()) || endTime > new Date()) {
      return sendError(res, 403, 'Feedback is available only after the event has ended');
    }

    const registration = getStudentRegistration(event, req.user._id);
    if (!registration) {
      return sendError(res, 403, 'Only students marked Present may submit feedback');
    }

    const existingFeedback = await Feedback.findOne({
      event: event._id,
      student: req.user._id,
    });
    if (existingFeedback) {
      return res.status(409).json({
        status: 'fail',
        message: 'Feedback has already been submitted',
        data: { feedback: serializeFeedback(existingFeedback) },
      });
    }

    const feedback = await Feedback.create({
      event: event._id,
      student: req.user._id,
      rating,
      comment: comment.trim(),
    });

    return res.status(201).json({
      status: 'success',
      data: { feedback: serializeFeedback(feedback) },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      try {
        const existingFeedback = await Feedback.findOne({
          event: eventId,
          student: req.user._id,
        });
        return res.status(409).json({
          status: 'fail',
          message: 'Feedback has already been submitted',
          ...(existingFeedback && {
            data: { feedback: serializeFeedback(existingFeedback) },
          }),
        });
      } catch (lookupError) {
        return next(lookupError);
      }
    }
    return next(error);
  }
}

async function getEventFeedback(req, res, next) {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) {
    return sendError(res, 400, 'Invalid event ID');
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return sendError(res, 404, 'Event not found');
    }

    if (req.user.role === 'Student') {
      const feedback = await Feedback.findOne({
        event: event._id,
        student: req.user._id,
      });
      if (!feedback) {
        return sendError(res, 404, 'Feedback submission not found');
      }
      return res.status(200).json({
        status: 'success',
        data: { feedback: serializeFeedback(feedback) },
      });
    }

    if (req.user.role === 'Organizer' &&
      String(event.organizer) !== String(req.user._id)) {
      return sendError(res, 403, 'You do not have permission to view this feedback');
    }
    if (req.user.role !== 'Organizer' && req.user.role !== 'Admin') {
      return sendError(res, 403, 'You do not have permission to view this feedback');
    }

    const [result = { summary: [], distribution: [], comments: [] }] =
      await Feedback.aggregate([
        { $match: { event: event._id } },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalResponses: { $sum: 1 },
                  averageRating: { $avg: '$rating' },
                },
              },
            ],
            distribution: [
              { $group: { _id: '$rating', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            comments: [
              { $match: { comment: { $nin: ['', null] } } },
              {
                $project: {
                  _id: 0,
                  rating: 1,
                  comment: 1,
                  submittedAt: '$createdAt',
                },
              },
              { $sort: { submittedAt: -1 } },
            ],
          },
        },
      ]);

    const summary = result.summary[0];
    const distributionCounts = Object.fromEntries(
      result.distribution.map(({ _id, count }) => [String(_id), count])
    );
    const ratingDistribution = Object.fromEntries(
      [1, 2, 3, 4, 5].map((rating) => [
        rating,
        distributionCounts[String(rating)] || 0,
      ])
    );

    return res.status(200).json({
      status: 'success',
      data: {
        averageRating: summary ? Number(summary.averageRating.toFixed(2)) : 0,
        totalResponses: summary?.totalResponses || 0,
        ratingDistribution,
        comments: result.comments,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitFeedback,
  getEventFeedback,
};
