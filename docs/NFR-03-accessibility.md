# NFR-03 — Responsive and accessible interface

Implementation started on 2026-11-02; refreshed evidence recorded on 2026-11-06 for [requirement issue #14](https://github.com/SE-MiniProject-Team15/project-documentation/issues/14). The branch `feat/nfr-03-responsive-accessible-ui` incorporates main through `c16cff2`, including FR-05 registration/tickets and NFR-04 recovery. FR-03, FR-07 and the closed FR-08 PR remain separate feature branches.

## Findings and corrections

| Finding | Correction | Verification |
| --- | --- | --- |
| Organizer forms and event lists squeezed into a horizontal flex layout | One column on phones/tablets; two flexible columns from 900px; full-width labeled fields and wrapped action buttons | Overflow assertions at 320, 768 and 1440px; mobile screenshot inspected |
| Weak accent/button contrast, undefined surface/muted colors, faint input boundaries | Defined light/dark surface colors, darker light-theme accent, theme-specific button text, visible control borders | axe WCAG AA contrast checks in both themes |
| Secondary buttons inherited the primary background | Explicit secondary background, border and text colors | Initial browser scan identified this; corrected cases pass |
| Route changes lacked clear keyboard destination and meaningful page titles | Skip link, focusable main landmark and route-specific titles; focus moves into main on path changes | Keyboard test follows skip link and navigates login to registration |
| Organizer validation relied on server messages and incomplete field requirements | Field-specific messages and `aria-invalid`/`aria-describedby`; focus first invalid field; validate required details, dates, capacity and image URL | Browser checks invalid/empty forms, retained values and focused field |
| Password rules were not associated with the password control | Linked instructions and invalid-password state; focus invalid password while preserving entered data | Browser submission test and axe scan |
| Drafts need to remain usable without completing the approval form | Draft save bypasses required-field checks; empty capacity is omitted instead of converted to zero; invalid provided capacity has a clear message | Browser test inspects draft request payload |
| Notifications rendered a duplicate organizer-management page on main | Restored notification history, role-specific dashboard link, read/unread labels and mark-as-read action | Browser tests populated history, read action and failure message |
| Status changes lacked accessible announcements | Added status regions for loading/results and notification updates, retained alert regions for errors | axe scans and functional assertions |
| Hover movement did not respect reduced-motion preferences | Removed movement/transitions when reduced motion is requested | Computed-style browser assertion |

## Repeatable checks

```sh
npm --prefix client ci
npm --prefix client exec -- playwright install chromium
npm --prefix client run test:a11y
npm --prefix client run lint
npm --prefix client run build
npm --prefix server test
git diff --check
```

For an existing local Chrome installation, the browser suite can instead run with:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm --prefix client run test:a11y
```

The client CI job installs Chromium, Firefox and WebKit and runs both browser suites after lint and build, then uploads the HTML report and test artifacts for 14 days. Playwright retains traces on failures. Generated screenshots and traces are in `client/test-results/`, which is excluded from version control.

The automated suite covers login, account creation, Student/Organizer/Admin dashboards, event discovery, event details, organizer management, notification history, registration/QR tickets and the existing student-events page. Each page is checked at 320, 768 and 1440 CSS pixels in light and dark themes: 66 page/theme/viewport cases. Seven additional cases check keyboard navigation, form errors and incomplete drafts, password guidance, notification read actions, invalid event dates/capacity, notification failures, expanded text spacing and reduced motion.

The standards reference is [WCAG 2.1](https://www.w3.org/TR/WCAG21/), particularly labels/relationships, contrast, reflow, text spacing, keyboard access, focus order/visibility, page titles, error identification/instructions and status messages. axe scans use `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags. Controls are at least 44 CSS pixels high where practical; this is an additional usability choice.

## Evidence and limits

Local tooling: Node 20.20.2, Google Chrome 153.0.8010.36, Playwright 1.64.1 and axe 4.13.0. Browser-engine details and functional-flow evidence are recorded in [NFR-07](NFR-07-browser-compatibility.md). Browser tests use controlled API responses, including role-specific accounts and long event titles/venues. They exercise the rendered React interface without requiring a running database or production accounts.

| Final local check | Result |
| --- | --- |
| Browser suite | 73 accessibility cases per engine passed on Chromium, Firefox and WebKit, plus installed Chrome; no axe violations for the configured WCAG tags |
| Client lint | Passed |
| Client production build | Passed |
| Latest main-branch server suite | 15/15 passed; no server implementation changed |
| Whitespace and reproduction-script syntax checks | Passed |

The PR CI workflow runs these checks and retains browser evidence. The separate browser-flow suite adds four core user journeys per engine.

The 320px checks exercise narrow reflow, while a separate case applies expanded line, letter and word spacing. The mobile organizer screenshot was visually inspected for readable labels, correctly stacked panels and usable buttons.

This is a scoped automated and keyboard assessment, not a claim of full WCAG conformance. A screen-reader assessment, real first-time-user study, live database integration and the latest two versions of all four browsers remain outside this evidence. Cross-browser coverage is tracked separately by NFR-07. Re-run accessibility checks when unmerged feature pages and feedback dialogs are integrated; their historical findings and subsequent verification are recorded in [the FR-05/FR-08 review](reviews/FR-05-FR-08-review.md).
