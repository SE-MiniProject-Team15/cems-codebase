\# NFR-01 — Performance and Response Time Test Results



\## 1. Objective



Verify that CEMS API response times meet the performance targets specified in NFR-01.



\## 2. Event Listing Performance Test



\- \*\*Endpoint:\*\* `GET /api/events/public`

\- \*\*Tool:\*\* Autocannon

\- \*\*Concurrent connections:\*\* 200

\- \*\*Test duration:\*\* 30 seconds



| Metric | Observed result |

|---|---:|

| Total requests | Approximately 9,000 |

| Average latency | 659.77 ms |

| 97.5th percentile latency | 1,078 ms |

| 99th percentile latency | 1,287 ms |

| Maximum latency | 1,905 ms |

| Average throughput | 300.94 requests/second |



\*\*Acceptance target:\*\* Event listing response within 3 seconds.



\*\*Observed result:\*\* All reported latency measurements were below 3 seconds.



\## 3. Registration Performance Test



\- \*\*Endpoint:\*\* `POST /api/auth/register`

\- \*\*Test type:\*\* Single registration request

\- \*\*HTTP status:\*\* 201 Created

\- \*\*Observed response time:\*\* 248.22 ms



\*\*Acceptance target:\*\* Registration response within 2 seconds.



\*\*Observed result:\*\* The measured response time was below 2 seconds.



\## 4. Test Limitations



\- The event listing endpoint returned an empty event collection during testing.

\- Registration was tested with one request, not 200 concurrent registrations.

\- Registration is rate-limited to 10 attempts per IP address per 15-minute window.

\- Tests were conducted in the local development environment.



\## 5. Conclusion



Both endpoints met their respective response-time targets in the tests performed. Additional testing with populated event data and a controlled production-like environment is recommended.





