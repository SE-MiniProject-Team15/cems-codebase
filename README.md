# College Event Management System (CEMS)

A full-stack web application designed to simplify campus event management by providing a centralized platform for event creation, administrative approvals, student registrations, QR-based attendance tracking, and post-event feedback.

Developed by **Team 15** as part of the **Software Engineering Laboratory Mini-Project**.

---

## 🚀 Tech Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, React Router, Axios |
| Backend | Node.js, Express.js, Mongoose |
| Database | MongoDB (Replica Set Support) |
| Backend Testing | Node.js Native Test Runner (`node --test`) |
| Frontend Testing | Playwright |
| Browser Testing | Chromium, Firefox, WebKit |
| CI/CD | GitHub Actions |

---

## 📁 Repository Structure

```text
cems-codebase/
├── .github/
│   └── workflows/          # Automated CI pipelines
├── client/                 # React + Vite frontend
│   └── ...                 # Playwright E2E browser tests
├── docs/                   # Integration reports and test evidence
└── server/                 # Express REST API, models, controllers and tests
```

---

## ✨ Key Features

### 1. Authentication & Role-Based Access Control (RBAC)
- Secure user signup and login.
- Session management and password recovery.
- Three distinct user roles:
  - **Student:** Browse events, register, check in, and submit feedback.
  - **Organizer:** Create and manage events.
  - **Admin:** Review and manage event approval requests.
- Role-based authorization to protect restricted operations.

### 2. Event Lifecycle & Approval Workflow
- Organizers can create and edit campus events.
- Events follow an administrative approval workflow:
  - Pending Approval
  - Changes Requested
  - Approved
  - Rejected
- Administrators can approve, reject, or request modifications to submitted events.
- Immutable audit logging through `EventAuditLog` to maintain a record of administrative actions.

### 3. Event Discovery & Registration
- Browse approved campus events.
- Search and filter events by:
  - Event title
  - Category
  - Venue
  - Department
  - Date range
- Students can register for events with available seats.

### 4. QR & Short-Code Attendance Check-In
- Generates digital registration passes for registered students.
- Supports QR-code scanning for attendance verification.
- Provides manual registration short-code verification as an alternative.
- Enables organizers to manage event attendance at the venue.

### 5. Event Feedback & Ratings
- Role-guarded feedback submission.
- Students can submit feedback after attending events.
- Ratings are aggregated to provide an overview of event feedback.

---

## ⚙️ Local Setup & Execution

### Prerequisites

Ensure the following are installed:

- [Node.js](https://nodejs.org/) (v20 or later recommended)
- npm
- [MongoDB](https://www.mongodb.com/) running locally
- MongoDB Replica Set enabled for testing transactional operations.

### 1. Clone the Repository

```bash
git clone <repository-url>
cd cems-codebase
```

### 2. Backend Setup

Navigate to the server directory:

```bash
cd server
npm install
```

Configure the environment variables in `server/.env`.

Provide the required configuration, including:

- MongoDB connection string (with `replicaSet` parameter if required).
- JWT secrets.
- Session secrets.

Start the backend server:

```bash
npm start
```

### 3. Frontend Setup

Open a separate terminal and navigate to the client directory:

```bash
cd client
npm install
npm run dev
```

Open the application in your browser:

**http://localhost:5173**

---

## 🧪 Testing

System integration testing was executed on **12 November 2026**.

The project includes backend unit and workflow tests, system integration tests, frontend build validation, linting, and cross-browser end-to-end testing.

### 1. Backend Unit & Workflow Tests

**141 automated tests**

```bash
cd server
npm test
```

Uses the Node.js Native Test Runner (`node --test`) to validate backend functionality and workflows.

### 2. System Integration Tests

Run the integration suite separately from the backend unit tests:

```bash
cd server
npm run test:integration
```

Refer to the `docs/` directory for the system integration execution report, test scope, rerun instructions, and recorded evidence.

### 3. Frontend Build & Lint

```bash
cd client

npm run lint
npm run build
```

Validates frontend code quality and verifies that the application can be bundled for production.

### 4. Cross-Browser End-to-End Tests

**231 Playwright checks**

Install the required browsers:

```bash
npx playwright install --with-deps chromium firefox webkit
```

Execute the cross-browser test suite:

```bash
npm run test:browsers
```

The suite validates application workflows across:

- Chromium
- Firefox
- WebKit

---

## 🔄 Continuous Integration (CI)

The project uses **GitHub Actions** to automate testing and validation.

Every push and Pull Request to the `main` branch triggers two CI jobs:

| CI Job | Automated Checks |
|---|---|
| **CI / server** | Executes all 141 backend tests using `npm test`. |
| **CI / client** | Runs linting, production build validation, and 231 Playwright cross-browser checks. |

This ensures that backend functionality, frontend code quality, production builds, and browser-level workflows are continuously validated.

---

## 👥 Contributors

**Team 15 – Software Engineering Laboratory Mini-Project**

| Contributor | GitHub |
|---|---|
| Prajwal Hegde | [@prajwalhegde593](https://github.com/prajwalhegde593) |
| Ashith Rao | [@DarthCoder01](https://github.com/DarthCoder01) |
| G Purvi | [@purvigiridhar](https://github.com/purvigiridhar) |
| Leeshar | [@Leeshar1905](https://github.com/Leeshar1905) |

---

## 📌 Project Overview

The College Event Management System provides an integrated solution for managing the complete campus event lifecycle, from event creation and administrative approval to student registration, attendance verification, and post-event feedback.

By combining role-based access control, transactional database support, automated testing, and continuous integration, CEMS aims to provide a reliable and maintainable platform for campus event management.

**Built by Team 15.**
