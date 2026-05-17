# Architecture

**Analysis Date:** 2026-05-17

## Pattern Overview

**Overall:** Express modular monolith with route-centric feature modules, shared domain services, and MongoDB models.

**Key Characteristics:**
- `index.js` is the single composition root for HTTP, Socket.IO, DB connection, and schedulers.
- Feature routes in `routes/*.js` orchestrate auth checks, model queries, and service calls directly.
- Shared business capabilities (notifications, shift/queue logic, realtime emitters) are centralized in `services/*.js`.

## Layers

**Composition/Bootstrap Layer:**
- Purpose: Initialize runtime dependencies and wire modules.
- Location: `index.js`
- Contains: Express app setup, CORS policy, Mongo connection, route mounting, Socket.IO server creation, graceful shutdown, scheduler startup.
- Depends on: `routes/*.js`, `socket/*.js`, `services/notificationScheduler.js`, `services/pushNotification.service.js`, `mongoose`.
- Used by: Node runtime via `package.json` (`"start": "node index.js"`).

**Interface Layer (HTTP Routes):**
- Purpose: Define API endpoints and request/response orchestration.
- Location: `routes/`
- Contains: Feature routers such as `routes/auth.js`, `routes/appointments.js`, `routes/queue.js`, `routes/notifications.js`.
- Depends on: `auth/auth.middleware.js`, `models/*.js`, `services/*.js`.
- Used by: Mounted paths in `index.js` (e.g., `/auth`, `/appointments`, `/queue`).

**Domain Service Layer:**
- Purpose: Encapsulate reusable business workflows and side effects.
- Location: `services/`
- Contains: Notification fanout in `services/notification.service.js`, realtime payload emission in `services/realtimeEvents.js`, schedule generation in `services/shiftScheduler.js`, queue slot utilities in `services/queueSlots.js`.
- Depends on: `models/*.js`, `socket/io.js`, third-party SDKs in service-specific files.
- Used by: Route handlers and startup flow in `index.js`.

**Persistence Layer:**
- Purpose: Define MongoDB schema contracts and indexes.
- Location: `models/`
- Contains: Domain schemas such as `models/appointment.js`, `models/shift.js`, `models/doctor.js`, `models/notification.js`.
- Depends on: `mongoose` (and `bcrypt` in `models/doctor.js` and `models/patient.js` pre-save hooks).
- Used by: Route and service modules.

**Realtime Layer:**
- Purpose: Manage WebSocket auth, room membership, and event constants.
- Location: `socket/`
- Contains: Socket singleton registry `socket/io.js`, event constants `socket/events.js`, connection handling `socket/sockethandler.js`.
- Depends on: `jsonwebtoken`, models, `services/notification.service.js`.
- Used by: `index.js` and `services/realtimeEvents.js`.

## Data Flow

**Authenticated API Request Flow (example: appointment creation):**

1. Client sends request to `/appointments` handled by `routes/appointments.js`.
2. `router.use(requireAuth)` in `routes/appointments.js` runs JWT parsing from `auth/auth.middleware.js` and sets `req.user`.
3. Route validates actor permissions and input (`doctorId`, `patientId`, `shiftId`, slot boundaries).
4. Route reads and writes persistence models (`models/patient.js`, `models/shift.js`, `models/appointment.js`, `models/queueState.js`).
5. Route triggers side effects through services: realtime broadcasts via `services/realtimeEvents.js` and notification creation via `services/notification.service.js`.
6. `services/notification.service.js` persists to `models/notification.js`, emits Socket.IO user-room event through `socket/io.js`, and dispatches push notifications via `services/pushNotification.service.js`.
7. Response is returned as JSON from the route handler.

**State Management:**
- Stateless HTTP auth uses JWT claims (`sub`, `role`) attached to `req.user` in `auth/auth.middleware.js`.
- Durable state is MongoDB-backed through Mongoose schemas in `models/`.
- In-memory singleton state is limited to Socket.IO instance registration in `socket/io.js`.
- Background recurring state updates are handled by interval scheduler in `services/notificationScheduler.js`.

## Key Abstractions

**Authentication Guard + Role Gate:**
- Purpose: Reusable request authorization envelope.
- Examples: `auth/auth.middleware.js`, usage in `routes/queue.js` (`requireRole('doctor')`) and global route protection via `router.use(requireAuth)`.
- Pattern: Middleware-first enforcement at router-level and endpoint-level.

**Queue Slot Derivation:**
- Purpose: Derive deterministic queue numbers from shift time windows.
- Examples: `services/queueSlots.js`, used in `routes/appointments.js` and `routes/queue.js`.
- Pattern: Pure utility functions (`buildSlots`, `buildSlotIndexMap`, `attachQueueNumbers`) consumed by route orchestrators.

**Notification Fanout:**
- Purpose: Single notification API for DB + socket + push channels.
- Examples: `services/notification.service.js`, called by `routes/auth.js`, `routes/payment.js`, `routes/reviews.js`, `routes/queue.js`, `services/notificationScheduler.js`.
- Pattern: Write-through side-effect service with persistence first, realtime second, push third.

**Realtime Event Bus Facade:**
- Purpose: Consistent event payloads and room targeting for appointments/queue.
- Examples: `services/realtimeEvents.js`, `socket/events.js`.
- Pattern: Service facade around Socket.IO singleton with model-aware payload builders.

## Entry Points

**HTTP + WebSocket Server Entry:**
- Location: `index.js`
- Triggers: `npm start` from `package.json`.
- Responsibilities: Configure middleware, connect MongoDB, mount routers, initialize Socket.IO, start notification scheduler, initialize Firebase admin, handle graceful shutdown.

**Socket Connection Entry:**
- Location: `socket/sockethandler.js`
- Triggers: `initSocket(io)` call in `index.js`, then client socket connect events.
- Responsibilities: Authenticate from handshake token, join per-user rooms and queue rooms, enforce room join permissions.

**Background Reminder Entry:**
- Location: `services/notificationScheduler.js`
- Triggers: `startNotificationScheduler()` call in `index.js`.
- Responsibilities: Leader lock acquisition in Mongo, periodic appointment reminder checks, deduplicated notification creation.

## Error Handling

**Strategy:** Local try/catch in route handlers and service methods with JSON error responses and HTTP status codes.

**Patterns:**
- Validation failures return 400/401/403/404/409 directly from routes (examples: `routes/auth.js`, `routes/appointments.js`, `routes/shifts.js`).
- Unexpected errors are logged with `console.error` and returned as 500 responses.

## Cross-Cutting Concerns

**Logging:** Console-based logging (`console.log`, `console.warn`, `console.error`) in `index.js`, route handlers, and services like `services/pushNotification.service.js`.
**Validation:** Inline request validation in each route file plus shared schedule/slot validators in `services/shiftScheduler.js` and `services/queueSlots.js`.
**Authentication:** JWT verification and role checks via `auth/auth.middleware.js`; sockets reuse JWT verification in `socket/sockethandler.js`.

---

*Architecture analysis: 2026-05-17*
