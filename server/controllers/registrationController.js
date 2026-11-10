const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { sendEmailToUsers } = require('../services/notificationService');

const MAX_SAVE_ATTEMPTS = 5;

function sendError(res, status, message) {
  return res.status(status).json({ status: 'fail', message });
}

function isVersionConflict(error) {
  return error.name === 'VersionError';
}

function isPubliclyApproved(event) {
  return event.status === 'Approved' ||
    (event.status !== 'Cancelled' && Boolean(event.approvedSnapshot));
}

function getPublishedDetails(event) {
  if (event.status !== 'Approved' && event.approvedSnapshot) {
    return event.approvedSnapshot.toObject
      ? event.approvedSnapshot.toObject()
      : event.approvedSnapshot;
  }
  return event;
}

function registrationPayload(event, registration) {
  const registrationCode = registration.registrationCode;
  return {
    id: registration._id,
    eventId: event._id,
    status: registration.status,
    createdAt: registration.createdAt,
    ...(registrationCode && {
      registrationCode,
      qrPayload: `CEMS-REGISTRATION:${event._id}:${registration._id}:${registrationCode}`,
    }),
  };
}

async function notifyStudent(recipient, eventId, type, title, message) {
  let saved = true;
  try {
    await Notification.create({ recipient, event: eventId, type, title, message });
  } catch (error) {
    saved = false;
    console.error('Registration notification could not be saved:', error.name || 'Error');
  }

  await sendEmailToUsers([recipient], title, message);
  return saved;
}

async function findRegistrationEvent(eventId) {
  return Event.findOne({ _id: eventId }).select('+registrations.registrationCode');
}

async function registerForEvent(req, res, next) {
  const { eventId } = req.params;
  const studentId = req.user._id;

  if (!mongoose.isValidObjectId(eventId)) {
    return sendError(res, 400, 'Invalid event ID');
  }

  try {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
      const event = await findRegistrationEvent(eventId);
      if (!event || !isPubliclyApproved(event)) {
        return sendError(res, 404, 'Approved event not found');
      }

      const details = getPublishedDetails(event);
      const now = new Date();
      if (new Date(details.registrationDeadline) <= now) {
        return sendError(res, 400, 'The registration deadline has passed');
      }
      if (new Date(details.startDateTime) <= now) {
        return sendError(res, 400, 'Registration is closed for events that have started');
      }

      const studentKey = String(studentId);
      const previousRegistration = event.registrations.find(
        (registration) =>
          String(registration.student) === studentKey &&
          registration.status !== 'Cancelled'
      );
      if (previousRegistration || event.registeredStudents.some(
        (registeredStudent) => String(registeredStudent) === studentKey
      )) {
        return sendError(res, 409, 'You already have an active registration for this event');
      }

      const isFull = event.registeredStudents.length >= Number(details.capacity);
      const status = isFull ? 'Waitlisted' : 'Registered';
      const registration = {
        student: studentId,
        status,
        ...(status === 'Registered' && {
          registrationCode: crypto.randomBytes(32).toString('hex'),
        }),
      };

      event.registrations.push(registration);
      if (status === 'Registered') {
        event.registeredStudents.addToSet
          ? event.registeredStudents.addToSet(studentId)
          : event.registeredStudents.push(studentId);
      }

      try {
        await event.save();
      } catch (error) {
        if (isVersionConflict(error) && attempt < MAX_SAVE_ATTEMPTS - 1) {
          continue;
        }
        if (isVersionConflict(error)) {
          return sendError(res, 409, 'The event changed during registration. Please try again.');
        }
        throw error;
      }

      const savedRegistration = event.registrations[event.registrations.length - 1];
      const notificationSaved = status === 'Registered'
        ? await notifyStudent(
          studentId,
          event._id,
          'REGISTRATION_CONFIRMATION',
          'Registration confirmed',
          `Your registration for "${details.title}" is confirmed.`
        )
        : await notifyStudent(
          studentId,
          event._id,
          'WAITLIST_JOINED',
          'Added to the waitlist',
          `You are on the waitlist for "${details.title}".`
        );

      return res.status(201).json({
        status: 'success',
        message: status === 'Registered'
          ? 'Registration confirmed.'
          : 'Event is full. You have joined the waitlist.',
        data: {
          registration: registrationPayload(event, savedRegistration),
          notificationSaved,
        },
      });
    }

    return sendError(res, 409, 'Could not complete registration. Please try again.');
  } catch (error) {
    return next(error);
  }
}

async function cancelRegistration(req, res, next) {
  const { eventId } = req.params;
  const studentId = req.user._id;

  if (!mongoose.isValidObjectId(eventId)) {
    return sendError(res, 400, 'Invalid event ID');
  }

  try {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
      const event = await findRegistrationEvent(eventId);
      if (!event) {
        return sendError(res, 404, 'Event not found');
      }

      const details = getPublishedDetails(event);
      if (new Date(details.startDateTime) <= new Date()) {
        return sendError(res, 400, 'Registrations can only be cancelled before the event starts');
      }

      const registration = event.registrations.find(
        (item) =>
          String(item.student) === String(studentId) &&
          item.status !== 'Cancelled'
      );
      if (!registration) {
        return sendError(res, 404, 'Active registration not found');
      }

      const wasRegistered = registration.status === 'Registered';
      registration.status = 'Cancelled';
      if (wasRegistered) {
        if (event.registeredStudents.pull) {
          event.registeredStudents.pull(studentId);
        } else {
          const index = event.registeredStudents.findIndex(
            (id) => String(id) === String(studentId)
          );
          if (index >= 0) event.registeredStudents.splice(index, 1);
        }
      }

      let promotedRegistration;
      if (wasRegistered && isPubliclyApproved(event)) {
        const nextInLine = event.registrations
          .filter((item) => item.status === 'Waitlisted')
          .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))[0];

        if (nextInLine) {
          nextInLine.status = 'Registered';
          nextInLine.registrationCode = crypto.randomBytes(32).toString('hex');
          event.registeredStudents.addToSet
            ? event.registeredStudents.addToSet(nextInLine.student)
            : event.registeredStudents.push(nextInLine.student);
          promotedRegistration = nextInLine;
        }
      }

      try {
        await event.save();
      } catch (error) {
        if (isVersionConflict(error) && attempt < MAX_SAVE_ATTEMPTS - 1) {
          continue;
        }
        if (isVersionConflict(error)) {
          return sendError(res, 409, 'The event changed during cancellation. Please try again.');
        }
        throw error;
      }

      let promotionNotificationSaved = true;
      if (promotedRegistration) {
        const promotedStudentId = promotedRegistration.student;
        promotionNotificationSaved = await notifyStudent(
          promotedStudentId,
          event._id,
          'WAITLIST_PROMOTED',
          'You are off the waitlist',
          `A seat is now confirmed for "${details.title}".`
        );
      }

      return res.status(200).json({
        status: 'success',
        message: promotedRegistration
          ? 'Registration cancelled and the next student was promoted.'
          : 'Registration cancelled successfully.',
        data: {
          cancelledRegistrationId: registration._id,
          promoted: Boolean(promotedRegistration),
          promotionNotificationSaved,
        },
      });
    }

    return sendError(res, 409, 'Could not complete cancellation. Please try again.');
  } catch (error) {
    return next(error);
  }
}

async function listMyRegistrations(req, res, next) {
  try {
    const events = await Event.find({
      'registrations.student': req.user._id,
      'registrations.status': { $in: ['Registered', 'Waitlisted'] },
    }).select('+registrations.registrationCode');

    const now = new Date();
    const registrations = [];
    for (const event of events) {
      const details = getPublishedDetails(event);
      if (event.status === 'Cancelled' || new Date(details.startDateTime) <= now) {
        continue;
      }

      for (const registration of event.registrations) {
        if (
          String(registration.student) !== String(req.user._id) ||
          !['Registered', 'Waitlisted'].includes(registration.status)
        ) {
          continue;
        }

        registrations.push({
          ...registrationPayload(event, registration),
          event: {
            id: String(event._id),
            title: details.title,
            category: details.category,
            venue: details.venue,
            startDateTime: details.startDateTime,
            endDateTime: details.endDateTime,
          },
        });
      }
    }

    registrations.sort(
      (left, right) => new Date(left.event.startDateTime) - new Date(right.event.startDateTime)
    );

    return res.status(200).json({
      status: 'success',
      results: registrations.length,
      data: { registrations },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerForEvent,
  cancelRegistration,
  listMyRegistrations,
};
