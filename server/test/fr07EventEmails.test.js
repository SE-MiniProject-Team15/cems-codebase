const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Event = require('../models/Event');
const EventAuditLog = require('../models/EventAuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { decideEvent, updateEvent, cancelEvent } = require('../controllers/eventController');

test('approval, requested changes, event updates, and cancellation notify the right users', async (t) => {
  const original = {
    startSession: mongoose.startSession,
    findOne: Event.findOne,
    exists: Event.exists,
    auditCreate: EventAuditLog.create,
    notificationCreate: Notification.create,
    insertMany: Notification.insertMany,
    userFind: User.find,
    createTransport: nodemailer.createTransport,
    env: {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
    },
  };
  t.after(() => {
    mongoose.startSession = original.startSession;
    Event.findOne = original.findOne;
    Event.exists = original.exists;
    EventAuditLog.create = original.auditCreate;
    Notification.create = original.notificationCreate;
    Notification.insertMany = original.insertMany;
    User.find = original.userFind;
    nodemailer.createTransport = original.createTransport;
    for (const [key, value] of Object.entries(original.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'mailer@example.test';
  process.env.SMTP_PASS = 'test-password';

  const eventId = '507f1f77bcf86cd799439010';
  const organizerId = '507f1f77bcf86cd799439011';
  const studentId = '507f1f77bcf86cd799439012';
  const inbox = [];
  const notices = [];
  const event = {
    _id: eventId,
    organizer: organizerId,
    status: 'Pending Approval',
    title: 'Campus workshop',
    category: 'Workshop',
    description: 'A useful event',
    venue: 'Main Hall',
    department: 'Engineering',
    startDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    capacity: 20,
    bannerUrl: 'https://example.test/banner.png',
    approvedSnapshot: undefined,
    registeredStudents: [studentId],
    toObject() { return { ...this }; },
    async save() {},
  };

  mongoose.startSession = async () => ({
    async withTransaction(callback) { await callback(); },
    async endSession() {},
  });
  Event.findOne = () => ({
    session: async () => event,
    then(resolve, reject) { return Promise.resolve(event).then(resolve, reject); },
  });
  Event.exists = async () => null;
  EventAuditLog.create = async ([record]) => [record];
  Notification.create = async ([notice]) => { notices.push(notice); return [notice]; };
  Notification.insertMany = async (items) => { notices.push(...items); return items; };
  User.find = (filter) => ({
    select: async () => filter._id.$in.map((id) => ({
      email: id === organizerId ? 'organizer@example.test' : 'student@example.test',
    })),
  });
  nodemailer.createTransport = () => ({
    async sendMail(mail) { inbox.push(mail); },
  });

  function response() {
    return {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
  }
  const next = (error) => { throw error; };

  const approval = response();
  await decideEvent(
    { params: { id: eventId }, user: { _id: '507f1f77bcf86cd799439013' }, body: { action: 'approve' } },
    approval, next
  );
  assert.equal(approval.statusCode, 200);

  const update = response();
  await updateEvent(
    { params: { id: eventId }, user: { _id: organizerId }, body: { title: 'Revised workshop' } },
    update, next
  );
  assert.equal(update.statusCode, 200);

  const changes = response();
  await decideEvent(
    {
      params: { id: eventId },
      user: { _id: '507f1f77bcf86cd799439013' },
      body: { action: 'request_changes', comments: 'Please revise the event description.' },
    },
    changes, next
  );
  assert.equal(changes.statusCode, 200);

  const cancellation = response();
  await cancelEvent(
    { params: { id: eventId }, user: { _id: organizerId } },
    cancellation, next
  );
  assert.equal(cancellation.statusCode, 200);

  assert.deepEqual(inbox.map((mail) => mail.to), [
    'organizer@example.test',
    'student@example.test',
    'organizer@example.test',
    'student@example.test',
  ]);
  assert.deepEqual(notices.map((notice) => notice.type), [
    'APPROVAL_DECISION',
    'EVENT_UPDATED',
    'APPROVAL_DECISION',
    'EVENT_CANCELLED',
  ]);
  assert.match(inbox[2].text, /Please revise the event description/);
  assert.match(inbox[3].text, /Campus workshop/);
});
