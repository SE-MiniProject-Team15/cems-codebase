@'
# Code and Branch Coverage Report

## Overall Test Coverage Summary
* **Coverage Tool**: `c8` (`npx c8 --reporter=text --reporter=html node --test "test/**/*.test.js"`)
* **Total Tests Executed**: 35 Passed, 0 Failed
* **Statement Coverage**: 62.45%
* **Branch Coverage**: 66.05%
* **Function Coverage**: 57.81%
* **Line Coverage**: 62.45%

## Key Highlights
* **Models (`Event.js`, `Notification.js`, `User.js`)**: ~96.5% statement coverage and 100% branch coverage across schema validation and hooks.
* **Controllers & Routes**: High branch coverage across authentication middleware (`85.71%`), registration/waitlist promotion logic (`registrationController.js`), event discovery/privacy sanitization, and health endpoints.
* **Backup Automation (`server/scripts/backup.js`)**: `87.12%` statement coverage covering dump execution, logging, and failed-archive cleanup.
'@ | Set-Content -Path "docs\CODE_AND_BRANCH_COVERAGE_REPORT.md" -Encoding UTF8