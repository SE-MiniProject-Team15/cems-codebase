# NFR-07 — Browser compatibility evidence

Recorded 2026-11-06 for [requirement #18](https://github.com/SE-MiniProject-Team15/project-documentation/issues/18). Implementation is based on main `c16cff2`, with the NFR-03 interface improvements.

## Automated coverage

Each engine runs 73 accessibility/responsiveness checks and four functional journeys: account creation, organizer login, browsing/filtering followed by registration/QR ticket/cancellation, and submitting a complete organizer event. Native date, datetime-local, number and select controls are exercised. Accessibility covers 11 pages at 320, 768 and 1440 pixels in light/dark themes, keyboard focus, validation, notifications, reduced motion and expanded text spacing.

| Tested environment | Evidence |
| --- | --- |
| Playwright Chromium 156.0.8078.4 | 73 accessibility cases and four functional flows passed |
| Playwright Firefox 157.0 | 73 accessibility cases and four functional flows passed |
| Playwright WebKit 27.2 on Linux | 77/77 passed |
| Installed Google Chrome 153.0.8010.36 on Linux | 77/77 passed |

These version numbers identify the binaries actually run. They are not a claim that these are the latest stable releases. Tests use controlled API responses, not a live database or real email delivery. The WebKit mobile organizer screenshot was inspected for readable labels, stacked panels and usable buttons.

## Reproduce

```sh
cd client
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:browsers
# Chromium accessibility checks alone:
npm run test:a11y
# Optional installed Chrome and Edge channels, after installing those browsers:
PLAYWRIGHT_BRANDED_BROWSERS=1 npx playwright test --project=chrome --project=edge
# Existing Chrome binary on Linux:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npx playwright test --project=chromium
```

Run suites sequentially: separate concurrent invocations can share a development server which one invocation then shuts down. CI owns its server and fails if the configured port is occupied. The CI client job installs browser dependencies, runs all three engines, and uploads `browser-test-evidence` with the HTML report, mobile screenshot and any failure traces for 14 days.

The local WebKit installation initially lacked `libavif16`, `libgav1-1` and `libyuv0`. Ubuntu packages were extracted under `/tmp/cems-webkit-libs` and loaded for the test process; no system packages were changed. CI uses Playwright's normal `--with-deps` installation. An initial local Chrome run also lost a server shared with another test run; the sequential rerun passed all 77 cases.

## Outstanding acceptance evidence

Issue #18 explicitly requires the **latest two major versions of Chrome, Firefox, Edge and Safari**. Engine coverage above does not satisfy that entire matrix. WebKit on Linux is not Safari, and Chromium is not branded Edge. Do not close this issue solely on these automated results.

For each of the following, record the exact browser and OS versions, date, tested commit, outcome and evidence location:

| Required environment | Status |
| --- | --- |
| Latest and previous stable Chrome | Installed Chrome tested; release-pair verification outstanding |
| Latest and previous stable Firefox | Playwright build tested; stable release-pair verification outstanding |
| Latest and previous stable Edge | Outstanding; branded Edge not installed |
| Latest and previous stable Safari on supported macOS | Outstanding; macOS/Safari environment unavailable |

Run the four automated user journeys on supported branded channels, and repeat them manually on Safari: create/login to a test account; search/filter/open an event; register and inspect a QR ticket; cancel; create and submit an organizer event. Check narrow layout, keyboard navigation, validation/errors and notifications in both themes. Use non-production fixtures/accounts and attach failures with reproduction steps. Retest the approval and feedback pages after their separate PRs are integrated.
