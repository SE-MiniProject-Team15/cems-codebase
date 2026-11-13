# CEMS Branch Coverage Report

**Project:** College Event Management System (CEMS)\
**Execution date:** 13 November 2026\
**Coverage command:** `node --experimental-test-coverage --test`\
**Working directory:** `server`

## 1. Summary

  Metric                      Result
  ------------------------- --------
  Backend tests executed          19
  Tests passed                    19
  Tests failed                     0
  Overall branch coverage     80.27%

The percentage is the overall value reported by Node.js for all included
files, including test files.

## 2. File-level branch coverage

  File                                  Branch coverage
  ----------------------------------- -----------------
  `config/auth.js`                               66.67%
  `controllers/authController.js`                81.82%
  `controllers/eventController.js`               44.00%
  `middleware/authMiddleware.js`                 87.50%
  `models/Event.js`                             100.00%
  `models/Notification.js`                      100.00%
  `models/User.js`                              100.00%
  `services/notificationService.js`             100.00%
  `test/authController.test.js`                  94.12%
  `test/authMiddleware.test.js`                  84.00%
  `test/eventDraft.test.js`                     100.00%
  **All files**                              **80.27%**

## 3. Analysis

-   The event controller has the lowest reported branch coverage among
    the listed application files at 44.00%.
-   Authentication controller branch coverage is 81.82%.
-   Authentication middleware branch coverage is 87.50%.
-   The Node.js report shows 100% branch coverage for the notification
    service, but its line coverage is only 15.09%. Therefore, the 100%
    branch figure does not mean the entire service has been thoroughly
    executed.
-   The overall branch percentage includes test files and must not be
    presented as production-source-only branch coverage.

## 4. Recommended improvements

1.  Add event controller tests for valid requests, invalid inputs,
    authorization failures, missing records and database errors.
2.  Add notification service tests for its main execution paths and
    failure handling.
3.  Add tests for remaining authentication controller/configuration
    branches.
4.  Re-run `node --experimental-test-coverage --test` after adding tests
    and replace the figures in this report with the latest measured
    output.

## 5. Conclusion

The latest recorded branch coverage is 80.27% across all files included
in the Node.js coverage report. The event controller is the main
branch-coverage improvement area. Additional tests are required before
the project can claim complete branch coverage or full test-plan
completion.
