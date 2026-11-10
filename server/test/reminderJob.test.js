const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { runReminders } = require('../services/reminderJob');

test('published snapshots get one reminder for their scheduled event time', async (t) => {
  const original = {
    find: Event.find,
    exists: Notification.exists,
    create: Notification.create,
    createTransport: nodemailer.createTransport,
    env: {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
    },
  };
  t.after(() => {
    Event.find = original.find;
    Notification.exists = original.exists;
    Notification.create = original.create;
    nodemailer.createTransport = original.createTransport;
    for (const [key, value] of Object.entries(original.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'mailer@example.test';
  process.env.SMTP_PASS = 'test-password';

  const now = new Date('2026-11-01T00:00:00.000Z');
  const scheduledFor = new Date('2026-11-02T00:00:30.000Z');
  const sent = [];
  const notices = [];
  let filter;

  Event.find = (query) => {
    filter = query;
    return {
      populate: async () => [{
        _id: '507f1f77bcf86cd799439012',
        status: 'Changes Requested',
        title: 'Unapproved title',
        approvedSnapshot: { title: 'Published title', startDateTime: scheduledFor },
        registeredStudents: [{ _id: '507f1f77bcf86cd799439011', email: 'student@example.test' }],
      }],
    };
  };
  Notification.exists = async (query) => notices.some((item) =>
    String(item.event) === String(query.event) &&
    String(item.recipient) === String(query.recipient) &&
    +item.scheduledFor === +query.scheduledFor
  );
  Notification.create = async (notice) => { notices.push(notice); return notice; };
  nodemailer.createTransport = () => ({
    async sendMail(mail) { sent.push(mail); },
  });

  await runReminders(now);
  await runReminders(now);

  assert.ok(filter.$or.some((part) => part['approvedSnapshot.startDateTime']));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].scheduledFor, scheduledFor);
  assert.match(notices[0].message, /Published title/);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Published title/);
});
