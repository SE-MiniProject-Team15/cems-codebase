# Database Backup and Recovery Procedure

## Scope and objectives

This procedure covers the CEMS MongoDB database. The service-level objective
is 99% availability during active college semesters. The operational recovery
objectives are:

- **RPO:** at most 24 hours of data, based on a successful daily backup.
- **RTO:** restore essential service within 4 hours after recovery is approved.

These are operational targets, not a guarantee. A backup is not considered
usable until a restore test has completed successfully.

## Daily backup setup

The script uses MongoDB Database Tools (`mongodump`) and the `MONGO_URI`
configured in `server/.env`. The URI must include the database name. Configure
`BACKUP_DIR` to a protected, durable location outside the application checkout;
the default `backups` folder at the repository root is intended for development
only. Restrict access to backups because they contain personal and event data.

Run a manual backup from the `server` directory:

```powershell
$env:BACKUP_DIR = 'D:\CEMSBackups'
npm run backup
```

```sh
BACKUP_DIR=/var/backups/cems npm run backup
```

Each invocation creates a timestamped database directory containing a gzip
`mongodump`. It writes one JSON log record with the UTC timestamp, target
directory, database name, duration in milliseconds, and `completed` or `failed`
status. A failed/incomplete dump directory is removed, and the command exits
with a non-zero status. The connection URI is not written to the log.

### Schedule once per day

Use the host's scheduler; the application does not schedule backups itself.

**Windows Task Scheduler**

1. Create a task with a daily trigger at a low-traffic time (for example 02:00).
2. Set the action to `powershell.exe`.
3. Use arguments similar to the following, replacing paths as appropriate:

   ```powershell
   -NoProfile -Command "$env:BACKUP_DIR='D:\CEMSBackups'; Set-Location 'C:\CEMS\server'; npm run backup"
   ```

4. Configure the task to run whether or not a user is logged in, using a service
   account that can read the server's environment file and write to the backup
   destination. Enable task history and alert on non-zero exit codes.

**Linux cron**

Run `crontab -e` for the service account and add a daily entry (adjust paths):

```cron
0 2 * * * cd /opt/cems/server && BACKUP_DIR=/var/backups/cems npm run backup >> /var/log/cems-backup.log 2>&1
```

Monitor scheduler history and backup logs daily. Periodically copy successful
backups to a separate protected failure domain. Apply the organization's
encryption-at-rest and retention policies to local and off-host copies.

## Restore procedure

> **Warning:** `--drop` replaces matching target collections. Never restore
> over production until the incident lead has approved it, a recent backup is
> selected, and the current database has been preserved where possible.

1. Declare the incident and record its start time. Assign an operator and obtain
   approval for the target database.
2. Stop writes to the affected application/database or place the application in
   maintenance mode.
3. Select the newest backup whose log says `"status":"completed"`. Confirm its
   directory exists, is readable, and contains the expected database dump.
4. Confirm the restore target URI/database with the incident lead. For a test,
   use an isolated MongoDB instance and a disposable database, never production.
5. From `server`, set `BACKUP_DIR` and `MONGO_URI` to the intended destination,
   then run:

   ```powershell
   $env:BACKUP_DIR = 'D:\CEMSBackups'
   $env:MONGO_URI = 'mongodb://restore-user:REDACTED@restore-host:27017/cems_restore?authSource=admin'
   $backup = 'D:\CEMSBackups\cems-YYYY-MM-DDTHH-MM-SS-sssZ'
   mongorestore --uri="$env:MONGO_URI" --gzip --drop `
     --nsInclude="cems.*" --nsFrom="cems.*" --nsTo="cems_restore.*" `
     --dir="$backup"
   ```

   ```sh
   BACKUP_DIR=/var/backups/cems
   MONGO_URI='mongodb://restore-user:REDACTED@restore-host:27017/cems_restore?authSource=admin'
   mongorestore --uri="$MONGO_URI" --gzip --drop \
     --nsInclude='cems.*' --nsFrom='cems.*' --nsTo='cems_restore.*' \
     --dir="/var/backups/cems/cems-YYYY-MM-DDTHH-MM-SS-sssZ"
   ```

   Replace `cems` with the source database name from `MONGO_URI`, and use the
   actual backup directory. The namespace remapping restores into the isolated
   `cems_restore` database. For production recovery to the original database,
   set the destination URI to that database and remove `--nsFrom`/`--nsTo`.
   Protect shell history and process access when supplying credentials in
   command arguments; prefer an approved MongoDB Database Tools config/secret
   mechanism for production restores.
6. Verify restore output reports no failed namespaces. Connect to the restored
   database and compare collection names and document counts with the source
   backup/known pre-incident counts. Run application-level checks for users,
   events, registrations, attendance, and feedback; verify representative
   records and required indexes.
7. Start the application against the restored target and confirm
   `GET /api/health` returns HTTP 200 with `status: "healthy"` and database
   `readyState: 1`. Exercise sign-in and read-only event/registration flows.
8. Record elapsed recovery time, the selected backup timestamp (to calculate
   actual data loss/RPO), integrity checks, operator, and outcome. Obtain
   incident-lead approval before resuming writes and redirecting production
   traffic.

## Restore test execution record

### Environment validation for this implementation

| Field | Record |
|---|---|
| Date checked | 2026-11-06 |
| MongoDB Database Tools | `mongodump` and `mongorestore` were not available on PATH |
| Local MongoDB target | MongoDB service was stopped; localhost port 27017 was not listening |
| Live restore result | **Not run** — no isolated MongoDB target or restore tools were available |

This is an explicit limitation, not a successful live restore. Do not treat the
backup/restore process as production-verified until the following test record
is completed against an isolated database:

### Required isolated restore test record (pending)

| Field | Required record |
|---|---|
| Test date / operator | Record the actual execution date and operator |
| Source backup | Completed backup directory and logged backup timestamp |
| Isolated target | Disposable database/instance (must not be production) |
| Restore command / result | Record exact command with credentials redacted and exit result |
| Integrity checks | Collection list, document counts, key record checks, and index checks |
| Application check | Health endpoint and representative read flows |
| Recovery elapsed time | Start-to-verified-service duration; target **<= 4 hours (RTO)** |
| Data loss | Difference between failure time and selected backup timestamp; target **<= 24 hours (RPO)** |
| Outcome | Pass/fail, evidence location, and follow-up actions |

The implementation test suite verifies backup completion/failure logging,
incomplete-dump cleanup, and health endpoint payloads. These automated tests do
not replace an isolated `mongorestore` execution.

## Availability monitoring

`GET /api/health` returns HTTP 200 with process uptime, an ISO timestamp, and
the Mongoose database connection state. It reports `healthy` only when
`readyState` is `1`; otherwise it reports `degraded`. Configure an external
monitor to poll this endpoint at least once per minute and alert on timeouts,
non-200 responses, or `status` other than `healthy`. Calculate semester
availability from the monitor's measured successful/total intervals; the
endpoint alone does not establish a 99% SLA.
