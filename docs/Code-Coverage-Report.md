# CEMS Code Coverage Report

**Project:** College Event Management System (CEMS)\
**Execution date:** 13 November 2026\
**Coverage command:** `node --experimental-test-coverage --test`\
**Working directory:** `server`

## 1. Summary

The coverage command executed 19 backend tests. All 19 passed and none
failed.

  Metric                Overall coverage
  ------------------- ------------------
  Line coverage                   51.81%
  Branch coverage                 80.27%
  Function coverage               58.47%

**Important:** The Node.js coverage summary includes both application
files and test files. The overall percentages must not be interpreted as
coverage of production source code alone.

## 2. File-level coverage

  File                                     Line %    Branch %   Function %
  ----------------------------------- ----------- ----------- ------------
  `config/auth.js`                          71.43       66.67       100.00
  `controllers/authController.js`           86.29       81.82       100.00
  `controllers/eventController.js`          14.37       44.00        19.05
  `middleware/authMiddleware.js`            94.44       87.50       100.00
  `models/Event.js`                        100.00      100.00         0.00
  `models/Notification.js`                 100.00      100.00       100.00
  `models/User.js`                          88.68      100.00         0.00
  `services/notificationService.js`         15.09      100.00         0.00
  `test/authController.test.js`             99.19       94.12        73.81
  `test/authMiddleware.test.js`             97.37       84.00        83.33
  `test/eventDraft.test.js`                 96.00      100.00        66.67
  **All files**                         **51.81**   **80.27**    **58.47**

## 3. Interpretation

-   Authentication controller line coverage is 86.29%.
-   Authentication middleware line coverage is 94.44%, following tests
    for missing/invalid tokens, valid cookie and Bearer tokens, and
    deleted users.
-   Event controller line coverage is 14.37%, indicating substantial
    untested implementation paths.
-   Notification service line coverage is 15.09%, indicating substantial
    untested implementation paths.
-   The 0% function coverage reported for some model files is the value
    emitted by the Node.js coverage reporter; it should be read
    alongside the line and branch figures, not as proof that the models
    are unused.

## 4. Coverage limitations and next steps

1.  Add focused tests for event controller success and error paths.
2.  Add notification service tests using controlled/mocked dependencies.
3.  Add tests for remaining authentication controller and configuration
    branches.
4.  Re-run the coverage command after any new tests and update this
    report with the new output.
5.  Consider reporting production-source-only coverage separately if the
    project configures a coverage tool that can exclude test files.

## 5. Conclusion

The recorded run achieved 51.81% overall line coverage, 80.27% overall
branch coverage and 58.47% overall function coverage across the files
included by the Node.js test runner. Coverage is strongest in
authentication middleware and model line/branch paths, while event
controller and notification service require additional tests.
