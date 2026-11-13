# CEMS System Validation Report

**Project:** College Event Management System (CEMS)\
**Repository:** `SE-MiniProject-Team15/cems-codebase`\
**Execution date:** 13 November 2026

## 1. Objective

This report records the system-level verification evidence available at
the time of reporting. It distinguishes completed checks from system
validation activities that remain pending.

## 2. Validation summary

  ------------------------------------------------------------------------------
  Validation activity            Evidence/status         Result
  ------------------------------ ----------------------- -----------------------
  Backend unit test suite        19 tests executed; 19   PASS
                                 passed; 0 failed        

  Frontend lint                  `npm run lint`          PASS
                                 completed successfully  

  Frontend production build      `npm run build`         PASS
                                 completed successfully; 
                                 90 modules transformed  

  UI-to-REST integration         No execution evidence   NOT VERIFIED
                                 recorded in this        
                                 session                 

  API-to-database integration    No execution evidence   NOT VERIFIED
                                 recorded in this        
                                 session                 

  Registration-to-notification   No execution evidence   NOT VERIFIED
  integration                    recorded in this        
                                 session                 

  End-to-end journeys across     No execution evidence   NOT VERIFIED
  Student, Organizer and Admin   recorded in this        
  roles                          session                 

  Cross-browser validation       No execution evidence   PENDING
                                 recorded in this        
                                 session                 

  User acceptance testing        No execution evidence   PENDING
                                 recorded in this        
                                 session                 
  ------------------------------------------------------------------------------

## 3. Verified behaviour

The backend unit tests verified authentication-related behaviour
including registration validation, successful registration, login
validation, successful login, incorrect-password rejection, token
validation, deleted-user rejection and role-based authorization. One
event-draft test verified that an incomplete draft remains in Draft
status.

The frontend lint and production build checks completed successfully.
These checks confirm code-quality/build checks only; they do not prove
that the application workflows work correctly in a browser.

## 4. Outstanding system validation

The following activities should be executed and their actual outcomes
recorded before system validation is considered complete:

1.  Run the application with the required backend, database and frontend
    services configured.
2.  Validate registration and login through the user interface.
3.  Verify role-specific access and navigation for Student, Organizer
    and Admin accounts.
4.  Verify event creation, editing, publication, registration and
    relevant event lifecycle workflows.
5.  Verify notification creation and delivery, including behaviour when
    the email service is unavailable.
6.  Verify API/database interactions and error handling.
7.  Execute the planned end-to-end scenarios and record screenshots or
    logs as evidence.
8.  Test supported browsers and record browser/version, test case,
    actual result and status.
9.  Conduct user acceptance testing and record feedback and sign-off.

## 5. Exit criteria status

The available evidence is not sufficient to confirm that all planned
test cases have been executed, the required functional pass rate has
been achieved across the complete test suite, all critical/high defects
are closed, or all non-functional requirements have passed. These
criteria remain to be assessed using the complete test execution record.

## 6. Conclusion

The backend unit tests and frontend lint/build checks passed. Full
system validation is **not yet complete** because integration,
end-to-end, cross-browser and UAT execution evidence is not available in
this report. The pending activities must be completed and documented
before final system acceptance.
