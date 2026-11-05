\# NFR-05 — Application Server Scalability



\## 1. Objective



Ensure that the Campus Event Management System (CEMS) can support increased traffic during peak event registration periods by allowing multiple application-server instances to operate behind a load balancer.



This document describes the proposed horizontal-scaling architecture, deployment requirements, scaling procedure, and hosting assumptions.



\## 2. Current Application Architecture



CEMS uses the following backend technologies:



\- Node.js

\- Express.js 5

\- MongoDB with Mongoose

\- JSON Web Tokens (JWT) for authentication

\- Cookie Parser and CORS for request handling

\- Node-Cron for scheduled event reminders

\- Nodemailer for email notifications



The application server is started using:



```bash

npm start

```



The server connects to MongoDB before accepting incoming requests.



Configuration is provided through environment variables, including:



\- `NODE\_ENV`

\- `PORT`

\- `CLIENT\_URL`

\- `MONGO\_URI`

\- `JWT\_SECRET`

\- `TRUST\_PROXY`



The application uses Express middleware and API routes for authentication, dashboards, events, and notifications.



\## 3. Proposed Horizontal-Scaling Architecture



The application can be deployed using multiple Express.js server instances behind a load balancer or reverse proxy.



Proposed architecture:



```text

&#x20;            Students / Organizers

&#x20;                      |

&#x20;                      v

&#x20;             Load Balancer

&#x20;                      |

&#x20;          +-----------+-----------+

&#x20;          |           |           |

&#x20;          v           v           v

&#x20;      Server 1    Server 2    Server 3

&#x20;      Express     Express     Express

&#x20;          |           |           |

&#x20;          +-----------+-----------+

&#x20;                      |

&#x20;                      v

&#x20;               Shared MongoDB

&#x20;                      |

&#x20;                      v

&#x20;             Shared Application Data

```



\### Scaling approach



1\. Deploy multiple instances of the same CEMS backend application.

2\. Configure each instance with the same application version and required environment variables.

3\. Assign a different listening port or container endpoint to each instance.

4\. Configure the load balancer to distribute incoming API requests across healthy instances.

5\. Connect all instances to the same MongoDB database.

6\. Use the same securely managed JWT secret across instances so that authentication tokens can be validated consistently.

7\. Add or remove application-server instances according to traffic and resource requirements.



The frontend continues communicating with the backend through the load balancer endpoint.



This is a proposed architecture; multiple production instances have not yet been deployed.



\## 4. Deployment Configuration and Dependencies



Each application-server instance requires:



\- Node.js runtime compatible with the project.

\- Application source code.

\- Dependencies installed using `npm ci`.

\- The `server/package-lock.json` file for reproducible dependency installation.

\- Network connectivity to the shared MongoDB database.

\- Access to the required environment variables.



\### Environment configuration



Each instance must have the following configuration:



| Variable | Purpose |

|---|---|

| `NODE\_ENV` | Application environment |

| `PORT` | Port used by the instance |

| `CLIENT\_URL` | Allowed frontend origin |

| `MONGO\_URI` | Shared MongoDB connection string |

| `JWT\_SECRET` | Shared JWT signing and verification secret |

| `TRUST\_PROXY` | Trusted load-balancer or reverse-proxy addresses |



Production requirements:



\- Use HTTPS for all external traffic.

\- Configure the load balancer or ingress to terminate TLS or forward traffic securely.

\- Set `TRUST\_PROXY` to the actual trusted proxy IP addresses or CIDR ranges.

\- Do not trust arbitrary forwarded headers or use `TRUST\_PROXY=\*`.

\- Restrict direct access to backend instances so traffic passes through the trusted ingress.

\- Store secrets securely rather than committing `.env` files to source control.



The existing `server/DEPLOYMENT.md` provides additional HTTPS and trusted-proxy configuration requirements.



\## 5. Scaling and Load-Test Procedure



The following procedure describes how horizontal scaling can be evaluated in a suitable test or staging environment.



\### Step 1 — Prepare the environment



\- Use a shared MongoDB database accessible to all application-server instances.

\- Configure identical application versions and environment variables.

\- Ensure all instances use the same JWT secret.

\- Configure a load balancer to distribute traffic across backend instances.



\### Step 2 — Start multiple instances



Start separate application-server instances using different ports or deployment endpoints.



For example:



```text

Instance 1: PORT=5000

Instance 2: PORT=5001

Instance 3: PORT=5002

```



The production deployment should use a process manager or container orchestration platform to manage these instances.



\### Step 3 — Verify request distribution



Send requests through the load balancer and verify that:



\- All configured instances are healthy.

\- API requests can be served through the common endpoint.

\- All instances can access the shared MongoDB database.

\- Authentication works consistently across instances.

\- Event registration and event updates remain consistent.



\### Step 4 — Perform load testing



Use a repeatable load-testing tool such as Autocannon.



Example:



```bash

npx autocannon -c 200 -d 30 http://localhost:5000/api/events/public

```



For a multi-instance deployment, the test must target the load balancer endpoint rather than an individual application-server instance.



Record:



\- Number of application-server instances.

\- Concurrent connections.

\- Test duration.

\- Average response time.

\- Median and maximum response time.

\- Requests per second.

\- Failed requests and error rates.

\- CPU and memory utilization.



Repeat the test with different instance counts and compare the results to identify whether additional instances improve capacity.



\### Step 5 — Record results



Document the test environment, instance count, configuration, results, observed bottlenecks, and any corrective actions.



Actual multi-instance load-test results must be recorded after the proposed deployment has been implemented.



\## 6. Limitations and Hosting Assumptions



The following assumptions and limitations apply to the proposed architecture.



\### Shared database



All application-server instances must connect to the same MongoDB deployment. The database must support the expected concurrent connections and workload.



The local development configuration uses a MongoDB instance at `127.0.0.1`. This local database configuration is not suitable as the shared database endpoint for multiple production servers.



\### Authentication



All instances must use the same securely managed JWT secret. Otherwise, tokens issued or verified by different instances may not work consistently.



\### Scheduled reminder jobs



The current implementation starts the Node-Cron reminder scheduler whenever an application-server instance starts.



Running multiple instances could therefore cause multiple schedulers to process the same reminders.



The existing notification existence check reduces duplicate notifications, but simultaneous processing is not guaranteed to be safe.



Before production horizontal scaling, the reminder scheduler should be moved to a dedicated single worker or a distributed job-processing mechanism with appropriate duplicate-processing protection.



\### Network and hosting



The hosting environment must provide:



\- A load balancer or reverse proxy.

\- Network access between application instances and MongoDB.

\- Secure environment-variable and secret management.

\- HTTPS support.

\- Sufficient CPU, memory, and connection capacity.

\- Monitoring and health-check capabilities.



\### Deployment limitations



No production load balancer, container orchestration platform, or multi-instance deployment is currently included in the verified implementation.



The proposed design depends on the capabilities of the approved hosting environment. Actual scalability and capacity must be validated through deployment-level testing.



\## 7. Conclusion



The CEMS backend is structured as an Express.js application that can be deployed as multiple application-server instances connected to a shared MongoDB database.



The existing environment-based configuration and trusted-proxy support provide a foundation for this deployment approach.



The proposed architecture, deployment requirements, scaling procedure, and hosting limitations are documented to support future horizontal scaling during peak event registration periods.



Production multi-instance deployment and load testing remain future validation activities.

