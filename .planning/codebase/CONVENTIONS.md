# Coding Conventions

**Analysis Date:** 2026-05-17

## Naming Patterns

**Files:**
- Use lowercase file names with domain-oriented suffixes (for example `routes/appointments.js`, `services/notification.service.js`, `auth/token.service.js`, `auth/auth.middleware.js`).
- Use singular model files in lowercase (for example `models/doctor.js`, `models/patient.js`, `models/appointment.js`).

**Functions:**
- Use camelCase for helpers and utilities (for example `normalizeDateOnly` in `routes/appointments.js`, `parseValidAmount` in `routes/payment.js`, `validateDoctorSchedule` in `services/shiftScheduler.js`).
- Use verb-first names for action functions (for example `createNotification` in `services/notification.service.js`, `sendPushNotification` in `services/pushNotification.service.js`).

**Variables:**
- Use descriptive camelCase local variables (`actorUserId`, `normalizedEmail`, `currentServing`) in `routes/auth.js`, `routes/reviews.js`, and `routes/queue.js`.
- Use UPPER_SNAKE_CASE for constants (`SLOT_MINUTES`, `CANCELLED_STATUS`, `OTP_TTL_MINUTES`) in `services/queueSlots.js`, `routes/appointments.js`, and `routes/auth.js`.

**Types:**
- Not applicable for static types: codebase is CommonJS JavaScript (`package.json` has `"type": "commonjs"`).

## Code Style

**Formatting:**
- No formatter config detected in repository root (`.prettierrc*` not present).
- Follow existing multi-line object formatting and trailing commas in schema/route objects as seen in `models/doctor.js` and `routes/notifications.js`.
- Preserve current mixed quote style per-file (single quotes in `routes/doctors.js`, double quotes in `routes/payment.js` and `routes/chatbot.js`) unless a formatter is introduced.

**Linting:**
- No linter config detected (`.eslintrc*`, `eslint.config.*`, `biome.json` not present at `C:\Users\Faizan\Desktop\SwiftCare\backend`).
- Use defensive runtime checks explicitly in handlers (for example `mongoose.Types.ObjectId.isValid(...)` in `routes/user.js` and `routes/payment.js`).

## Import Organization

**Order:**
1. Third-party packages first (`express`, `mongoose`, `multer`) as in `routes/user.js` and `routes/verification.js`
2. Router/model/service/auth local imports after external modules as in `index.js`, `routes/auth.js`
3. Constants/helpers declared after imports in same module (`routes/appointments.js`, `routes/payment.js`)

**Path Aliases:**
- None detected; use relative imports (`../models/...`, `./services/...`) across `routes/`, `services/`, and `auth/`.

## Error Handling

**Patterns:**
- Wrap async route handlers in `try/catch` and return JSON errors with HTTP status codes (`routes/reviews.js`, `routes/shifts.js`, `routes/notifications.js`).
- Use early-return validation checks for required fields and authorization (`routes/auth.js`, `routes/appointments.js`, `routes/patients.js`).
- Map known DB conflict errors (`error.code === 11000`) to 409 or idempotent responses (`routes/appointments.js`, `routes/payment.js`, `routes/shifts.js`).

## Logging

**Framework:** console

**Patterns:**
- Log operational failures with `console.error(...)` in catch blocks (`index.js`, `services/notificationScheduler.js`, `services/realtimeEvents.js`).
- Log startup/operational state with `console.log(...)` and `console.warn(...)` (`index.js`, `services/pushNotification.service.js`, `socket/sockethandler.js`).

## Comments

**When to Comment:**
- Use section-divider comments for route grouping (`/* -------------------------------------------------- */`) in `routes/auth.js`, `routes/appointments.js`, `routes/shifts.js`.
- Use inline intent comments for schema or migration context (`models/appointment.js`, `models/patient.js`).

**JSDoc/TSDoc:**
- Not detected in `routes/`, `services/`, `models/`, or `auth/`.

## Function Design

**Size:** 
- Keep reusable logic extracted into local helpers inside route files (`normalizeStatusInput`, `parsePagination` in `routes/appointments.js`) or service modules (`services/queueSlots.js`).

**Parameters:** 
- Pass structured object params for complex operations (`createNotification({...})` in `services/notification.service.js`, `ensureDoctorFutureShifts({...})` in `services/shiftScheduler.js`).

**Return Values:** 
- Return JSON payloads from routes and explicit structured objects from service utilities (`buildShiftQueueSnapshot` in `services/realtimeEvents.js`).

## Module Design

**Exports:** 
- Use `module.exports = router` for route modules (`routes/doctors.js`, `routes/user.js`, `routes/notifications.js`).
- Use named exports via object or `exports.fn = ...` for services (`services/email.service.js`, `auth/token.service.js`, `services/queueSlots.js`).

**Barrel Files:** 
- Not used; import modules directly by file path (for example `index.js` imports each route explicitly).

---

*Convention analysis: 2026-05-17*
