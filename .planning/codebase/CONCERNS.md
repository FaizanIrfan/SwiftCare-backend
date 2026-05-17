# Codebase Concerns

**Analysis Date:** 2026-05-17

## Tech Debt

**Mixed identifier strategy across domain models:**
- Issue: Domain relations use string IDs in multiple schemas instead of `ObjectId` references, which increases cross-collection mismatch risk and weakens query/index consistency.
- Files: `models/appointment.js`, `models/shift.js`, `models/review.js`, `models/queueState.js`, `routes/appointments.js`
- Impact: Authorization checks and joins depend on repeated string casting, making regressions more likely in permission and lookup logic.
- Fix approach: Standardize relational fields to `ObjectId` (or fully standardize strings) and enforce a single ID contract in models and route validation.

**Monolithic route modules:**
- Issue: Large route files combine validation, authorization, business logic, persistence, notifications, and realtime emits in single handlers.
- Files: `routes/auth.js`, `routes/appointments.js`, `routes/queue.js`
- Impact: High cognitive load and fragile edits; small changes risk side effects across unrelated workflows.
- Fix approach: Extract service-layer functions (booking, status transitions, OTP flows, queue transitions) and keep routes thin.

## Known Bugs

**Migration script command points to a missing file:**
- Symptoms: `npm run migrate:legacy-fields` fails because referenced script file is absent.
- Files: `package.json`
- Trigger: Running `npm run migrate:legacy-fields`.
- Workaround: Not applicable; script target must exist or command must be removed.

**App startup hard-fails when Gemini key is absent:**
- Symptoms: Server crashes during module load if `GEMINI_API_KEY` is missing.
- Files: `services/gemini.service.js`, `routes/chatbot.js`, `index.js`
- Trigger: Starting server without Gemini environment configuration.
- Workaround: Provide key, or defer Gemini client initialization until route execution with graceful fallback.

## Security Considerations

**Authentication bypass via mock admin token pattern (high impact):**
- Risk: Any bearer token starting with `mock-admin-token-` is granted admin privileges.
- Files: `auth/auth.middleware.js`
- Current mitigation: None in middleware logic.
- Recommendations: Remove mock token path from runtime code, or gate it behind an explicit non-production-only environment flag with strict checks.

**Sensitive identity documents are stored under a publicly served path (high impact):**
- Risk: Uploaded verification docs become reachable through static `/uploads` serving.
- Files: `routes/verification.js`, `index.js`
- Current mitigation: Basic MIME and size checks.
- Recommendations: Move sensitive uploads to private storage, add signed URL access controls, and avoid exposing document paths in broad API responses.

**Review creation allows patient impersonation:**
- Risk: Authenticated users can post reviews for another patient by providing arbitrary `patientId`.
- Files: `routes/reviews.js`
- Current mitigation: Existence checks for patient/doctor only.
- Recommendations: Enforce `req.user.sub === patientId` unless role is admin.

**Refresh token returned in JSON response in addition to cookie:**
- Risk: Refresh token exposure to client-side scripts and logs increases account takeover surface under XSS/log leakage.
- Files: `routes/auth.js`
- Current mitigation: HttpOnly cookie is also used.
- Recommendations: Stop returning refresh token in JSON payload; rotate and store only via HttpOnly cookie.

## Performance Bottlenecks

**Chatbot prompt scales with full doctor collection:**
- Problem: Every chat request fetches all doctors and injects full schedule context into LLM prompt.
- Files: `routes/chatbot.js`
- Cause: `Doctor.find()` with no projection, paging, caching, or relevance filtering.
- Improvement path: Add prompt context narrowing (specialty/location filters), projection, caching, and token budget enforcement.

**Queue progression endpoint repeatedly scans appointment list:**
- Problem: `/queue/next` performs repeated full queue reads inside retry loop.
- Files: `routes/queue.js`
- Cause: Read-modify-write retry pattern with repeated `Appointment.find(...)` per attempt.
- Improvement path: Add stronger queue state constraints, optimize indexed queries, and move queue advancement to atomic/transactional logic.

## Fragile Areas

**Appointment lifecycle write path without transaction boundaries:**
- Files: `routes/appointments.js`, `services/realtimeEvents.js`, `services/notification.service.js`
- Why fragile: Appointment save, queue updates, realtime emits, and notification creation run as separate operations; partial success creates inconsistent side effects.
- Safe modification: Introduce explicit transactional boundaries for DB writes; make notifications/emits idempotent async side effects.
- Test coverage: No automated tests detected for booking/status transition failure paths.

**Queue state uniqueness is not enforced at schema level:**
- Files: `models/queueState.js`, `routes/queue.js`
- Why fragile: `shiftId` is indexed but not unique, so concurrent upserts can create multiple state docs for one shift.
- Safe modification: Add unique index on `shiftId` and migration to deduplicate existing records before deploying.
- Test coverage: No concurrent queue mutation tests detected.

## Scaling Limits

**In-process scheduler and polling model:**
- Current capacity: Single process polling every minute for reminder windows.
- Limit: Increased appointment volume raises periodic DB scan cost; multi-instance deployments rely on lock correctness and can still increase lock contention overhead.
- Scaling path: Move reminders to queue-based jobs (e.g., delayed jobs) with shardable workers and indexed due-time lookups.

## Dependencies at Risk

**External AI dependency as startup-critical path:**
- Risk: `@google/generative-ai` usage is initialized eagerly and can block service startup on config errors.
- Impact: Non-chat features become unavailable when AI integration is misconfigured.
- Migration plan: Lazy-initialize AI client in route handler/service factory and isolate failure to chatbot endpoints.

## Missing Critical Features

**No visible rate limiting for auth/OTP/payment endpoints:**
- Problem: High-sensitivity endpoints can be brute-forced or abused.
- Blocks: Safe internet exposure of `routes/auth.js`, `routes/payment.js`, and document upload workflows in `routes/verification.js`.

## Test Coverage Gaps

**Automated tests are not present:**
- What's not tested: Authentication guards, appointment status transitions, payment verification flow, queue concurrency behavior, and file upload access controls.
- Files: `package.json`, `routes/auth.js`, `routes/appointments.js`, `routes/payment.js`, `routes/queue.js`, `routes/verification.js`
- Risk: Regressions in security and transactional behavior can ship unnoticed.
- Priority: High

---

*Concerns audit: 2026-05-17*
