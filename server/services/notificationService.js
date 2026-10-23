
const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendNotificationEmail(to, subject, message) {
  try {
    if (!to) return;

    const mailer = getTransporter();

    if (!mailer) {
      console.warn('Email not sent: SMTP configuration is missing.');
      return;
    }

    await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: message,
    });
  } catch (error) {
    // Email failure must not undo the underlying application action.
    console.error('Notification email delivery failed:', error.message);
  }
}

module.exports = { sendNotificationEmail };
