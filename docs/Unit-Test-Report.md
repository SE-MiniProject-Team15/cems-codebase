# CEMS Unit Test Report

**Project:** College Event Management System (CEMS)\
**Repository:** `SE-MiniProject-Team15/cems-codebase`\
**Execution date:** 13 November 2026\
**Test environment:** Node.js v22.19.0, Node.js built-in test runner

## 1. Objective

This report records the backend unit tests executed for the CEMS
codebase and the frontend static checks/build verification completed
during this testing session.

## 2. Test execution summary

  Item                                            Result
  --------------------------------------------- --------
  Backend unit tests executed                         19
  Passed                                              19
  Failed                                               0
  Skipped                                              0
  Backend test status                               PASS
  Frontend ESLint (`npm run lint`)                  PASS
  Frontend production build (`npm run build`)       PASS

Backend tests were executed with `npm test` from the `server` directory.
The test runner reported 19 tests, 19 passes and 0 failures.

## 3. Backend test coverage areas

  -----------------------------------------------------------------------
  Test area               Scenarios verified      Result
  ----------------------- ----------------------- -----------------------
  Registration validation Missing name, missing   PASS
                          email, missing          
                          password, short         
                          password                

  Registration            Prevent                 PASS
  authorization           self-registration as    
                          Admin                   

  Duplicate registration  Reject an already       PASS
                          registered email        

  Successful registration Create a Student        PASS
                          account, normalize      
                          email, return success   
                          and set auth cookie     

  Login validation        Missing credentials and PASS
                          unknown email           

  Successful login        Valid credentials       PASS
                          authenticate and set    
                          auth cookie             

  Login failure           Incorrect password is   PASS
                          rejected                

  Authentication          Missing token and       PASS
  protection              invalid token are       
                          rejected                

  Token authentication    Valid cookie token and  PASS
                          valid Bearer token are  
                          accepted                

  Deleted account         Token for a user that   PASS
                          no longer exists is     
                          rejected                

  Role authorization      Matching role is        PASS
                          allowed; different role 
                          is rejected             

  Event draft behaviour   Updating an incomplete  PASS
                          draft keeps its status  
                          as Draft                
  -----------------------------------------------------------------------

## 4. Frontend verification

The following commands were executed in the `client` directory:

-   `npm run lint` --- completed successfully with no reported lint
    errors or warnings.
-   `npm run build` --- completed successfully using Vite; 90 modules
    were transformed.

These are static analysis and production-build checks. They are not
frontend unit tests.

## 5. Test limitations

-   The 19 passing tests are backend unit tests; they do not establish
    that every application feature has been tested.
-   Full integration testing, end-to-end journeys, manual functional
    testing, cross-browser testing and user acceptance testing have not
    been evidenced by the results recorded here.
-   Event controller and notification service logic remain incompletely
    covered, as shown in the coverage reports.
-   No claim is made that all planned test cases or all project exit
    criteria have been met.

## 6. Conclusion

The executed backend unit test suite passed with 19/19 tests and no
failures. Frontend linting and production build checks also passed.
Further integration, system and manual testing is required before the
complete system can be declared validated.
