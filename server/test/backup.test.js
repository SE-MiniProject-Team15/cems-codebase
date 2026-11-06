const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabaseName, runBackup } = require('../scripts/backup');

test('backup records the database, target directory, duration, and success', async (t) => {
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cems-backup-'));
  const logLines = [];
  t.after(() => fs.rmSync(backupRoot, { recursive: true, force: true }));

  const targetDirectory = await runBackup({
    env: {
      MONGO_URI: 'mongodb://user:secret@localhost:27017/cems_test?authSource=admin',
      BACKUP_DIR: backupRoot,
    },
    log: (line) => logLines.push(JSON.parse(line)),
    spawnProcess(binary, args, options) {
      assert.equal(binary, 'mongodump');
      assert.equal(options.stdio, 'ignore');
      fs.mkdirSync(path.join(args[args.indexOf('--out') + 1], 'cems_test'));
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 0, null));
      return child;
    },
  });

  assert.ok(fs.existsSync(path.join(targetDirectory, 'cems_test')));
  assert.equal(logLines.length, 1);
  assert.equal(logLines[0].database, 'cems_test');
  assert.equal(logLines[0].targetDirectory, targetDirectory);
  assert.ok(logLines[0].durationMs >= 0);
  assert.equal(logLines[0].status, 'completed');
  assert.doesNotMatch(JSON.stringify(logLines), /secret/);
});

test('backup logs failure and removes an incomplete dump', async (t) => {
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cems-backup-fail-'));
  const logLines = [];
  t.after(() => fs.rmSync(backupRoot, { recursive: true, force: true }));

  await assert.rejects(runBackup({
    env: {
      MONGO_URI: 'mongodb://localhost:27017/cems_test',
      BACKUP_DIR: backupRoot,
    },
    log: (line) => logLines.push(JSON.parse(line)),
    spawnProcess(binary, args) {
      fs.writeFileSync(
        path.join(args[args.indexOf('--out') + 1], 'partial.dump'),
        'partial'
      );
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 1, null));
      return child;
    },
  }), /mongodump failed with exit code 1/);

  assert.equal(logLines[0].status, 'failed');
  assert.equal(logLines[0].database, 'cems_test');
  assert.equal(logLines[0].error, 'mongodump failed with exit code 1');
  assert.equal(fs.readdirSync(backupRoot).length, 0);
});

test('backup requires a named MongoDB database in the connection URI', () => {
  assert.equal(
    getDatabaseName('mongodb+srv://localhost/cems%5Fprod'),
    'cems_prod'
  );
  assert.throws(
    () => getDatabaseName('mongodb://localhost:27017'),
    /must include a database name/
  );
});
