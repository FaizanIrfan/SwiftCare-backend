# Codebase Structure

**Analysis Date:** 2026-05-17

## Directory Layout

```text
backend/
├── auth/                 # Authentication middleware and token/google clients
├── models/               # Mongoose schemas and indexes
├── routes/               # Express feature routers (HTTP API surface)
├── services/             # Reusable business logic + external integrations
├── socket/               # Socket.IO setup, events, and connection handlers
├── uploads/              # Runtime-uploaded verification files (served statically)
├── views/                # EJS template for root status page
├── index.js              # Application bootstrap and composition root
├── package.json          # Scripts, runtime metadata, dependencies
└── .planning/codebase/   # Architecture/planning documentation outputs
```

## Directory Purposes

**`auth/`:**
- Purpose: Centralize auth mechanics for HTTP and OAuth.
- Contains: `auth/auth.middleware.js`, `auth/token.service.js`, `auth/google.client.js`.
- Key files: `auth/auth.middleware.js` (JWT + role guard), `auth/token.service.js` (access/refresh signing).

**`models/`:**
- Purpose: Define persistence contracts.
- Contains: One schema per domain entity (appointments, users, shifts, notifications).
- Key files: `models/appointment.js`, `models/doctor.js`, `models/patient.js`, `models/shift.js`.

**`routes/`:**
- Purpose: Implement API endpoints grouped by feature.
- Contains: Router modules mounted in `index.js`.
- Key files: `routes/auth.js`, `routes/appointments.js`, `routes/queue.js`, `routes/shifts.js`, `routes/notifications.js`.

**`services/`:**
- Purpose: Encapsulate cross-route domain logic and third-party SDK usage.
- Contains: Scheduling, notification fanout, realtime emitters, payment and AI integrations.
- Key files: `services/notification.service.js`, `services/realtimeEvents.js`, `services/shiftScheduler.js`, `services/paymentService.js`.

**`socket/`:**
- Purpose: Realtime plumbing and event naming.
- Contains: `socket/io.js`, `socket/events.js`, `socket/sockethandler.js`.
- Key files: `socket/sockethandler.js` (room auth + joins), `socket/io.js` (singleton storage).

## Key File Locations

**Entry Points:**
- `index.js`: Main runtime entry for Express + Socket.IO + MongoDB + schedulers.

**Configuration:**
- `package.json`: Runtime scripts and engine declaration (`node >=18`).
- `index.js`: CORS and DB connection settings.
- `.env`: Environment configuration file present (do not read in codebase mapping).

**Core Logic:**
- `routes/*.js`: Request orchestration and endpoint permission checks.
- `services/*.js`: Shared workflows, side effects, and scheduler logic.
- `models/*.js`: Data shapes and indexes.

**Testing:**
- Not detected (no test directories or `*.test.*`/`*.spec.*` files in repository root structure).

## Naming Conventions

**Files:**
- Route files use plural/lowercase nouns: `routes/doctors.js`, `routes/appointments.js`.
- Service files use descriptive dot-suffix where needed: `services/notification.service.js`, `services/pushNotification.service.js`.
- Model files use singular entity names: `models/doctor.js`, `models/queueState.js`.

**Directories:**
- Top-level feature directories are lowercase single words: `routes`, `models`, `services`, `socket`, `auth`.

## Where to Add New Code

**New Feature:**
- Primary code: add a new router in `routes/<feature>.js` and mount it in `index.js`.
- Shared logic: place reusable logic in `services/<feature>.js`.
- Persistence: add schema updates in `models/<entity>.js`.
- Tests: create a new test folder (not currently present) under a new `tests/` directory or co-locate `*.test.js`.

**New Component/Module:**
- Authentication behavior: add to `auth/`.
- Realtime event behavior: add event constants in `socket/events.js` and emit helpers in `services/realtimeEvents.js`.

**Utilities:**
- Shared helpers with domain use should live in `services/` (pattern used by `services/queueSlots.js` and `services/shiftScheduler.js`).

## Special Directories

**`uploads/`:**
- Purpose: Stores doctor verification uploads from `routes/verification.js` multer disk storage.
- Generated: Yes.
- Committed: Yes (directory exists in repo; contents are runtime artifacts).

**`views/`:**
- Purpose: Server-rendered status page template used by `/` route in `index.js`.
- Generated: No.
- Committed: Yes (`views/main.ejs`).

**`.planning/codebase/`:**
- Purpose: Planning/mapping markdown docs consumed by orchestration commands.
- Generated: Yes.
- Committed: Yes.

---

*Structure analysis: 2026-05-17*
