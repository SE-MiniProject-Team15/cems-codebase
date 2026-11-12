# System integration test execution

System integration testing was executed on 12 November 2026 against application commit `398e39a25ccea38efe329fce39a0d87eb6e079f3`.

See [machine-readable final results](system-integration-results.json) for the execution timestamp, runtime, scenario outcomes and exit status. The [initial run](system-integration-initial-results.json) is retained: its attendance failure was a test harness error (raw registration code supplied instead of the full QR ticket). The runner was corrected without changing application code.

## Scope

This is separate from the team's unit tests. It starts the real Express application over HTTP, a temporary real MongoDB replica set with indexes and transaction support, and a local SMTP receiver. No database, API or mail transport is mocked. Chromium runs the real React application against this backend for login and event discovery.

Scenarios cover account registration/authentication and authorization; event submission, approval, audit persistence and publication; capacity, duplicate registration, waitlisting and promotion; notification ownership and read persistence; SMTP receipt; reminder deduplication; browser login/discovery; and attendance check-in and duplicate prevention.

The administrator is seeded directly. For attendance, the fixture moves the event into the current attendance window. The reminder worker is invoked with a controlled timestamp; cron scheduling itself is not tested. All test data and SMTP messages stay local and temporary services are stopped after execution.

## Repeat the run

Use Node.js 22 or newer. From the repository root:

```sh
npm ci --prefix server
npm ci --prefix client
cd client
npx playwright install chromium
cd ../server
npm run test:integration
```

For an existing Chrome installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. The recorded run used `/opt/google/chrome/chrome`. The first run downloads a MongoDB binary and needs internet access. Port 4175 must be available. The runner writes the final JSON report, exits nonzero on failure, and stops at the first failed scenario.

## Limits

This is a functional integration baseline, not full release certification. Only browser login/discovery are automated through the UI; other workflows use real HTTP requests. Production deployment/TLS, external email-provider delivery, all browser engines, load/concurrent-user stress, backup/restore, and every negative workflow are outside this run. Existing unit and mocked browser suites remain separate.

Dependency installation also reported an existing Mongoose advisory; dependency remediation is separate from this integration run.
