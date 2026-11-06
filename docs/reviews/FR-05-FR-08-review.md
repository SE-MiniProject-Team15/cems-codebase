# Purvi's FR-05 and FR-08 review


## Follow-up verification — 2026-11-06

The original findings below are historical. FR-05 is now merged into main; FR-08 PR #7 is closed without merging. There are no open review requests for DarthCoder01 among the repository's current open PRs.

| Scope | Reviewed revision | Result |
| --- | --- | --- |
| FR-05 privacy correction | `0c132a4` included in main `c16cff2` | Public endpoint omits registrations, registered students and attendance; latest main's 15 server tests pass |
| FR-08 corrections | `69d83d6dd2121f9463061aadb8ef26b900feaf2a` | All 20 server tests, client lint and build pass; public response omits private records |
| Both FR-08 dialogs | Same revision | Initial focus enters dialog; 12 forward and 12 backward Tab steps stay inside; Escape closes; focus returns to opener |

Verification scripts use the actual Express route with mocked database queries and the rendered React components with API fixtures:

```sh
node docs/reviews/verify-public-registration-privacy.cjs .
node docs/reviews/verify-public-registration-privacy.cjs /tmp/cems-fr08-current
# Start the FR-08 client on port 4174 before running:
node docs/reviews/verify-dialog-focus.mjs
node docs/reviews/verify-dialog-focus.mjs http://127.0.0.1:4174 summary
```

The original privacy and keyboard findings are resolved in the inspected revisions. This does not certify live MongoDB concurrency or reopen the closed feedback PR. The original reproduction scripts intentionally assert the old faulty behavior and should only be run against the original revisions below.

Your FR-03 and FR-07 PRs were also integrated with main and checked: 44 and 47 server tests respectively, plus client lint/build. Integration exposed a public serialization regression for rejected/changes-requested drafts; both branches now preserve the approved snapshot in all review states and test those states. Both PRs were pushed and their CI passed.

## Original review — 2026-11-02

Reviewed on 2026-11-02 against the SRS sections FR-05, FR-08, NFR-03 and security objective SO-1, and documentation issues [#7](https://github.com/SE-MiniProject-Team15/project-documentation/issues/7) and [#11](https://github.com/SE-MiniProject-Team15/project-documentation/issues/11).

| Pull request | Exact reviewed head | Recommendation |
| --- | --- | --- |
| [#6 — FR-05](https://github.com/SE-MiniProject-Team15/cems-codebase/pull/6) | `2b5687ac8dadb3117eee8c9c54303c8e0f25badb` | Request changes: public registration disclosure |
| [#7 — FR-08](https://github.com/SE-MiniProject-Team15/cems-codebase/pull/7) | `e26344d6f503f16b65973b01c2d979683019ac47` | Request changes: public attendance disclosure and modal keyboard handling |

Both reviews were submitted on 2026-11-02 as `DarthCoder01` with status **Changes requested**, anchored to the exact commits above: [FR-05 review](https://github.com/SE-MiniProject-Team15/cems-codebase/pull/6#pullrequestreview-5737090349) and [FR-08 review](https://github.com/SE-MiniProject-Team15/cems-codebase/pull/7#pullrequestreview-5737091546). The findings below are also posted as inline review comments. Neither contributor branch was edited or merged.

## PR #6: [P1] Exclude the new registrations array from public event responses

Location: [server/models/Event.js, lines 48–50](https://github.com/SE-MiniProject-Team15/cems-codebase/blob/2b5687ac8dadb3117eee8c9c54303c8e0f25badb/server/models/Event.js#L48-L50).

The new `registrations` array is selected by default. The existing unauthenticated `GET /api/events/public` route calls `listPublicEvents`, which serializes the full event document. Consequently, anyone can retrieve each student's ID, registration ID and Registered/Waitlisted/Cancelled status. Hiding only `registrationCode` does not protect these records. The old `registeredStudents` exposure predates this PR; this finding concerns the newly exposed registration records and statuses.

Return an explicit allowlist of public event fields from this endpoint. Keep registration records in authenticated, authorized endpoints and add a response regression test covering both an Approved event and an event with a published snapshot. This preserves private access for ticket, registration and organizer workflows.

Reproduction: the included script mounts the actual Express event router, substitutes only the database query with a real Mongoose event document, and makes an HTTP request without a cookie or authorization header. It returns HTTP 200 and `registrations[0].student`, `status` and `_id`. Ticket codes are omitted from the fixture to match the default query projection.

```sh
node docs/reviews/reproduce-public-registration-leak.cjs /tmp/cems-review-fr05
```

## PR #7: [P1] Prevent the new attendance field from becoming publicly readable

Location: [server/models/Event.js, lines 27–31](https://github.com/SE-MiniProject-Team15/cems-codebase/blob/e26344d6f503f16b65973b01c2d979683019ac47/server/models/Event.js#L27-L31).

`attendanceStatus` is added inside the already public registrations array. Once a registration is marked Present, an unauthenticated public-events request returns that status alongside the student's ID. The feedback summary correctly excludes student IDs, but this separate endpoint exposes identifiable attendance records, contrary to SO-1. The registration disclosure is inherited from FR-05; the new attendance disclosure is introduced here.

Apply the public-response allowlist fix and add a test proving that neither registration records nor attendance fields appear in public responses. Keep attendance available only to authorized users through private endpoints.

```sh
node docs/reviews/reproduce-public-registration-leak.cjs /tmp/cems-review-fr08
```

Observed result: HTTP 200 without authentication, with `attendanceExposed: true`.

## PR #7: [P2] Implement keyboard focus management for modal feedback

Location: [client/src/components/StudentFeedback.jsx, lines 59–65](https://github.com/SE-MiniProject-Team15/cems-codebase/blob/e26344d6f503f16b65973b01c2d979683019ac47/client/src/components/StudentFeedback.jsx#L59-L65). The same pattern appears in `FeedbackSummary.jsx`.

The feedback sections declare `role="dialog"` and `aria-modal="true"`, but have no initial focus, focus containment, Escape handler, or restoration of focus to the opening control. In a browser reproduction, selecting Leave Feedback keeps focus outside the dialog, Tab escapes into the background, and Escape leaves the dialog open. This makes the modal difficult to discover and operate with a keyboard or screen reader.

Use a native modal `<dialog>` with `showModal()` and appropriate focus restoration, or implement the complete modal keyboard pattern for both components. Verify initial focus, Tab/Shift+Tab containment, Escape dismissal and return focus. This follows the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

For the browser reproduction, start PR #7's client in a separate terminal:

```sh
npm --prefix /tmp/cems-review-fr08/client run dev -- --host 127.0.0.1 --port 4174 --strictPort
```

Then, from the NFR-03 checkout:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome node docs/reviews/reproduce-dialog-focus.mjs
```

The API fixture supplies one completed event with Present attendance. Observed output is `focusInsideDialog: false`, `remainsAfterEscape: true`, and `tabEscapesDialog: true`.

## Verification and scope

| Check | PR #6 | PR #7 |
| --- | --- | --- |
| Existing server tests | 10/10 passed | 19/19 passed |
| Client locked dependency install | Passed | Passed |
| Client lint | Passed | Passed |
| Client production build | Passed | Passed |
| Public disclosure reproduction | Confirmed | Confirmed, including attendance |
| Feedback modal keyboard reproduction | Not applicable | Confirmed on StudentFeedback; same missing handling identified by inspection in FeedbackSummary |

The reviewed registration logic includes role guards, deadline and capacity checks, duplicate prevention, random ticket codes, optimistic-concurrency retries and FIFO promotion on cancellation. The reviewed feedback logic includes Present/post-event eligibility checks, integer ratings from 1 to 5, optional comments, duplicate handling and an event/student unique index, ownership checks for organizers and anonymous aggregation.

Server tests and the HTTP reproduction substitute database operations; no live MongoDB concurrency test or index-creation test was performed. The browser reproduction also uses API fixtures. These passing checks do not resolve the findings above. Review PR #7 together with the FR-05 dependency and the eventual FR-06 check-in implementation before final integration.
