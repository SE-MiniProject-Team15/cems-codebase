const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function getDatabaseName(mongoUri) {
  let parsed;

  try {
    parsed = new URL(mongoUri);
  } catch {
    throw new Error('MONGO_URI must be a valid MongoDB connection URI');
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('MONGO_URI must use mongodb:// or mongodb+srv://');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!database) {
    throw new Error('MONGO_URI must include a database name');
  }

  return database;
}

function logRecord(record, log) {
  log(JSON.stringify(record));
}

function runMongodump(binary, mongoUri, targetDirectory, spawnProcess) {
  return new Promise((resolve, reject) => {
    let child;

    try {
      child = spawnProcess(
        binary,
        ['--uri', mongoUri, '--gzip', '--out', targetDirectory],
        { stdio: 'ignore' }
      );
    } catch (error) {
      reject(new Error(`Unable to start mongodump: ${error.message}`));
      return;
    }

    child.once('error', (error) => {
      reject(new Error(`Unable to start mongodump: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const result = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`mongodump failed with ${result}`));
    });
  });
}

async function runBackup({
  env = process.env,
  spawnProcess = spawn,
  log = console.log,
} = {}) {
  const startedAt = Date.now();
  let database = null;
  let targetDirectory = null;
  let cleanupError;

  try {
    if (!env.MONGO_URI) {
      throw new Error('MONGO_URI is not configured');
    }

    database = getDatabaseName(env.MONGO_URI);
    const backupRoot = path.resolve(
      env.BACKUP_DIR || path.resolve(__dirname, '..', '..', 'backups')
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    targetDirectory = path.join(backupRoot, `${database}-${timestamp}`);

    fs.mkdirSync(backupRoot, { recursive: true });
    fs.mkdirSync(targetDirectory);

    await runMongodump(
      env.MONGODUMP_BIN || 'mongodump',
      env.MONGO_URI,
      targetDirectory,
      spawnProcess
    );

    logRecord({
      timestamp: new Date().toISOString(),
      targetDirectory,
      database,
      durationMs: Date.now() - startedAt,
      status: 'completed',
    }, log);

    return targetDirectory;
  } catch (error) {
    if (targetDirectory && fs.existsSync(targetDirectory)) {
      try {
        fs.rmSync(targetDirectory, { recursive: true, force: true });
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure.message;
      }
    }

    logRecord({
      timestamp: new Date().toISOString(),
      targetDirectory,
      database,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      error: error.message,
      ...(cleanupError ? { cleanupError } : {}),
    }, log);

    throw error;
  }
}

if (require.main === module) {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
  runBackup().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = { getDatabaseName, runBackup };
