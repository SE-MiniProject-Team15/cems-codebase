const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { registerForEvent } = require('../controllers/registrationController');

test('registration keeps its in-app notice and succeeds when SMTP delivery fails', async (t) => {
  const original = {
    findOne: Event.findOne,
    create: Notification.create,
    find: User.find,
    createTransport: nodemailer.createTransport,
    error: console.error,
    env: {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
    },
  };
  t.after(() => {
    Event.findOne = original.findOne;
    Notification.create = original.create;
    User.find = original.find;
    nodemailer.createTransport = original.createTransport;
    console.error = original.error;
    for (const [key, value] of Object.entries(original.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'mailer@example.test';
  process.env.SMTP_PASS = 'test-password';

  const studentId = '507f1f77bcf86cd799439011';
  const eventId = '507f1f77bcf86cd799439012';
  const notices = [];
  const logs = [];
  let saved = false;
  let attemptedEmail;

  const event = {
    _id: eventId,
    title: 'Campus workshop',
    status: 'Approved',
    registrationDeadline: new Date(Date.now() + 60 * 60 * 1000),
    startDateTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    capacity: 10,
    registeredStudents: [],
    registrations: [],
    async save() { saved = true; },
  };
  Event.findOne = () => ({ select: async () => event });
  Notification.create = async (notice) => { notices.push(notice); return notice; };
  User.find = () => ({ select: async () => [{ email: 'student@example.test' }] });
  nodemailer.createTransport = () => ({
    async sendMail(mail) {
      attemptedEmail = mail;
      throw new Error('SMTP unavailable');
    },
  });
  console.error = (...args) => { logs.push(args.join(' ')); };

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await registerForEvent(
    { params: { eventId }, user: { _id: studentId } },
    res,
    (error) => { throw error; }
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.registration.status, 'Registered');
  assert.equal(saved, true);
  assert.equal(notices[0].type, 'REGISTRATION_CONFIRMATION');
  assert.equal(attemptedEmail.to, 'student@example.test');
  assert.match(attemptedEmail.text, /Campus workshop/);
  assert.ok(logs.some((line) => line.includes('Notification email delivery failed')));
});
