const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const servicePath = require.resolve('../services/notificationService');
const configKeys = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
];

function loadService(t, env = {}) {
  const originalCreateTransport = nodemailer.createTransport;
  const previousEnv = Object.fromEntries(configKeys.map((key) => [key, process.env[key]]));
  t.after(() => {
    nodemailer.createTransport = originalCreateTransport;
    delete require.cache[servicePath];
    for (const key of configKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });
  for (const key of configKeys) delete process.env[key];
  Object.assign(process.env, env);
  delete require.cache[servicePath];
  return require('../services/notificationService');
}

test('email delivery skips empty recipients and warns when SMTP is not configured', async (t) => {
  const service = loadService(t);
  let creates = 0;
  nodemailer.createTransport = () => { creates += 1; };
  const warnings = [];
  const originalWarn = console.warn;
  t.after(() => { console.warn = originalWarn; });
  console.warn = (message) => warnings.push(message);

  await service.sendNotificationEmail('', 'Subject', 'Body');
  await service.sendNotificationEmail('user@example.test', 'Subject', 'Body');
  assert.equal(creates, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /SMTP configuration is missing/);
});

test('email delivery configures one reusable transporter and sends expected fields', async (t) => {
  const service = loadService(t, {
    SMTP_HOST: 'smtp.example.test', SMTP_USER: 'mailer@example.test',
    SMTP_PASS: 'secret', SMTP_PORT: '2525', SMTP_SECURE: 'true',
    EMAIL_FROM: 'events@example.test',
  });
  const transports = [];
  const messages = [];
  nodemailer.createTransport = (options) => {
    transports.push(options);
    return { sendMail: async (message) => messages.push(message) };
  };

  await service.sendNotificationEmail('one@example.test', 'First', 'Hello');
  await service.sendNotificationEmail('two@example.test', 'Second', 'Welcome');

  assert.equal(transports.length, 1);
  assert.deepEqual(transports[0], {
    host: 'smtp.example.test', port: 2525, secure: true,
    auth: { user: 'mailer@example.test', pass: 'secret' },
  });
  assert.deepEqual(messages, [
    { from: 'events@example.test', to: 'one@example.test', subject: 'First', text: 'Hello' },
    { from: 'events@example.test', to: 'two@example.test', subject: 'Second', text: 'Welcome' },
  ]);
});

test('email delivery uses the default port and sender and contains transport errors', async (t) => {
  const service = loadService(t, {
    SMTP_HOST: 'smtp.example.test', SMTP_USER: 'mailer@example.test', SMTP_PASS: 'secret',
  });
  let transportOptions;
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return { sendMail: async () => { throw new Error('mail server down'); } };
  };
  const errors = [];
  const originalError = console.error;
  t.after(() => { console.error = originalError; });
  console.error = (...args) => errors.push(args);

  await service.sendNotificationEmail('user@example.test', 'Subject', 'Body');
  assert.equal(transportOptions.port, 587);
  assert.equal(transportOptions.secure, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], 'Error');
});
