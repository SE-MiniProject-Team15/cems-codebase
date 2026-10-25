const cron = require('node-cron');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { sendNotificationEmail } = require('./notificationService');

function startReminderJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const lower = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const upper = new Date(lower.getTime() + 5 * 60 * 1000);

      const events = await Event.find({
        status: 'Approved',
        startDateTime: { $gte: lower, $lt: upper },
      }).populate('registeredStudents', 'email name');

      for (const event of events) {
        for (const student of event.registeredStudents || []) {
          try {
            const existing = await Notification.exists({
              event: event._id,
              recipient: student._id,
              type: 'EVENT_REMINDER',
            });

            if (existing) continue;

            const message =
              `"${event.title}" starts in approximately 24 hours.`;

            await Notification.create({
              recipient: student._id,
              event: event._id,
              type: 'EVENT_REMINDER',
              title: 'Event reminder',
              message,
            });

            // Email failures must not prevent in-app notifications.
            try {
              await sendNotificationEmail(
                student.email,
                `Reminder: ${event.title}`,
                message
              );
            } catch (emailError) {
              console.error(
                'Reminder email failed:',
                emailError.message
              );
            }
          } catch (studentError) {
            console.error(
              'Could not create reminder for student:',
              studentError.message
            );
          }
        }
      }
    } catch (error) {
      console.error('Reminder job failed:', error.message);
    }
  });

  console.log('Event reminder job scheduled.');
}

module.exports = { startReminderJob };
