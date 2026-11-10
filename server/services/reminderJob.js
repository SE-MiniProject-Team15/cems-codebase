const cron = require('node-cron');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { sendNotificationEmail } = require('./notificationService');

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const PUBLISHED_REVIEW_STATES = ['Pending Approval', 'Rejected', 'Changes Requested', 'Draft'];

async function runReminders(now = new Date()) {
  const lower = new Date(now.getTime() + 24 * HOUR);
  const upper = new Date(lower.getTime() + MINUTE);

  try {
    const events = await Event.find({
      $or: [
        { status: 'Approved', startDateTime: { $gte: lower, $lt: upper } },
        {
          status: { $in: PUBLISHED_REVIEW_STATES },
          approvedSnapshot: { $exists: true, $ne: null },
          'approvedSnapshot.startDateTime': { $gte: lower, $lt: upper },
        },
      ],
    }).populate('registeredStudents', 'email name');

    for (const event of events) {
      const details = event.status === 'Approved' ? event : event.approvedSnapshot;
      const scheduledFor = details.startDateTime;

      for (const student of event.registeredStudents || []) {
        try {
          const key = {
            event: event._id,
            recipient: student._id,
            type: 'EVENT_REMINDER',
            scheduledFor,
          };
          if (await Notification.exists(key)) continue;

          const message = `"${details.title}" starts in approximately 24 hours.`;
          await Notification.create({
            ...key,
            title: 'Event reminder',
            message,
          });
          await sendNotificationEmail(student.email, `Reminder: ${details.title}`, message);
        } catch (error) {
          if (error.code !== 11000) {
            console.error('Could not create event reminder:', error.name || 'Error');
          }
        }
      }
    }
  } catch (error) {
    console.error('Reminder job failed:', error.name || 'Error');
  }
}

function startReminderJob() {
  cron.schedule('* * * * *', () => runReminders());
  console.log('Event reminder job scheduled.');
}

module.exports = { runReminders, startReminderJob };
