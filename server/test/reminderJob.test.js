const test = require('node:test');
const assert = require('node:assert/strict');
const cron = require('node-cron');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const mailer = require('../services/notificationService');

const jobPath = require.resolve('../services/reminderJob');

function setup(t, sendEmail = mailer.sendNotificationEmail) {
  const originals = {
    schedule: cron.schedule,
    find: Event.find,
    exists: Notification.exists,
    create: Notification.create,
    sendEmail: mailer.sendNotificationEmail,
    log: console.log,
    error: console.error,
  };
  t.after(() => {
    cron.schedule = originals.schedule;
    Event.find = originals.find;
    Notification.exists = originals.exists;
    Notification.create = originals.create;
    mailer.sendNotificationEmail = originals.sendEmail;
    console.log = originals.log;
    console.error = originals.error;
    delete require.cache[jobPath];
  });
  mailer.sendNotificationEmail = sendEmail;
  delete require.cache[jobPath];
  return require('../services/reminderJob');
}

function startTask(t, sendEmail) {
  const job = setup(t, sendEmail);
  let task;
  cron.schedule = (expression, callback) => {
    assert.equal(expression, '* * * * *');
    task = callback;
  };
  console.log = () => {};
  job.startReminderJob();
  return task;
}

test('reminder scheduler registers the one-minute job', (t) => {
  const job = setup(t);
  let expression;
  let task;
  cron.schedule = (schedule, callback) => {
    expression = schedule;
    task = callback;
    return { stop() {} };
  };
  console.log = () => {};

  job.startReminderJob();
  assert.equal(expression, '* * * * *');
  assert.equal(typeof task, 'function');
});

test('reminder job saves one in-app notice and sends a matching email', async (t) => {
  const sent = [];
  const task = startTask(t, async (...message) => { sent.push(message); });
  const student = { _id: 'student-1', email: 'student@example.test' };
  const event = {
    _id: 'event-1', status: 'Approved', title: 'Workshop',
    startDateTime: new Date('2026-11-13T10:00:00.000Z'), registeredStudents: [student],
  };
  let findFilter;
  let existingFilter;
  const saved = [];
  Event.find = (filter) => {
    findFilter = filter;
    return { populate: async (path, fields) => {
      assert.equal(path, 'registeredStudents');
      assert.equal(fields, 'email name');
      return [event];
    } };
  };
  Notification.exists = async (filter) => { existingFilter = filter; return null; };
  Notification.create = async (notice) => { saved.push(notice); };

  const before = Date.now();
  await task();

  const approvedWindow = findFilter.$or.find((filter) => filter.status === 'Approved').startDateTime;
  assert.ok(Math.abs(approvedWindow.$gte.getTime() - before - 24 * 60 * 60 * 1000) < 1000);
  assert.equal(approvedWindow.$lt.getTime() - approvedWindow.$gte.getTime(), 60 * 1000);
  assert.deepEqual(existingFilter, {
    event: event._id, recipient: student._id, type: 'EVENT_REMINDER', scheduledFor: event.startDateTime,
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].type, 'EVENT_REMINDER');
  assert.match(saved[0].message, /Workshop/);
  assert.deepEqual(sent[0], [student.email, 'Reminder: Workshop', saved[0].message]);
});

test('reminder job skips existing reminders and contains per-student failures', async (t) => {
  const task = startTask(t, async () => { throw new Error('email failed'); });
  const errors = [];
  console.error = (...args) => errors.push(args);
  Event.find = () => ({ populate: async () => [
    { _id: 'event-1', status: 'Approved', title: 'Workshop', startDateTime: new Date(), registeredStudents: [{ _id: 's1', email: 'a@example.test' }] },
    { _id: 'event-2', status: 'Approved', title: 'Talk', startDateTime: new Date(), registeredStudents: [{ _id: 's2', email: 'b@example.test' }] },
    { _id: 'event-3', status: 'Approved', title: 'Seminar', startDateTime: new Date(), registeredStudents: [{ _id: 's3', email: 'c@example.test' }] },
  ] });
  let existsCalls = 0;
  Notification.exists = async () => { existsCalls += 1; return existsCalls === 1; };
  let createCalls = 0;
  Notification.create = async () => {
    createCalls += 1;
    if (createCalls === 1) throw new Error('write failed');
  };

  await task();
  assert.equal(existsCalls, 3);
  assert.equal(errors.length, 2);
  assert.match(errors[0][0], /Could not create event reminder/);
  assert.match(errors[1][0], /Could not create event reminder/);
});

test('reminder job contains lookup failures', async (t) => {
  const task = startTask(t);
  const errors = [];
  console.error = (...args) => errors.push(args);
  Event.find = () => { throw new Error('database unavailable'); };

  await task();
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /Reminder job failed/);
});
