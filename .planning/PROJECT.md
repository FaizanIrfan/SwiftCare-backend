# SwiftCare Doctor-Patient Platform

## What This Is

SwiftCare is a doctor-patient platform backend focused on appointment booking and queue visibility. Patients can discover doctors, book appointments in preferred shifts, and track live queue progress. Doctors can manage queue flow and appointment status updates.

## Core Value

Patients should be able to book in the right shift and reliably track their live queue status end-to-end.

## Requirements

### Validated

- ✓ Backend API with JWT auth, role guards, and patient/doctor account flows — existing
- ✓ Appointment, shift, and queue data models with API routes — existing
- ✓ Realtime transport with Socket.IO for queue/notification updates — existing
- ✓ Notification pipeline (DB + socket + push + scheduler) — existing

### Active

- [ ] Patients can browse doctors and select available shifts for booking
- [ ] Patients can book appointments by preferred shift with clear queue position
- [ ] Patients can view live queue updates from booking to consultation
- [ ] Doctors can view and manage their queue in real time
- [ ] Doctors can update appointment/queue statuses with immediate patient visibility
- [ ] Reminder/notification experience is included for upcoming appointments and queue changes

### Out of Scope

- Telemedicine/video calls — explicitly deferred to keep v1 focused on in-clinic appointment + queue workflows
- Online payments — intentionally excluded for v1 to reduce launch complexity

## Context

- Existing backend is a brownfield Node.js/Express + MongoDB + Socket.IO system (`index.js`, `routes/`, `models/`, `services/`, `socket/`).
- Auth, appointments, shifts, queue, and notification primitives are already implemented and can be extended rather than rebuilt.
- External integrations exist for Firebase push, Google auth, Cloudinary, Stripe, and Gemini; v1 should focus on queue/booking outcomes first.
- No test suite is currently established, so phase planning should include explicit verification strategy.

## Constraints

- **Tech stack**: Keep Node.js/Express + MongoDB + Socket.IO architecture — align with existing production code paths.
- **Scope**: v1 prioritizes booking-by-shift + live queue + doctor queue operations — avoid broad feature expansion.
- **Payments**: No online payments in v1 — reduce integration complexity and dependency risk.
- **Feature boundary**: No telemedicine/video in v1 — preserve delivery focus on clinic flow reliability.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize patient booking + live queue as primary v1 value | Directly matches the user's core product goal and success definition | — Pending |
| Include both patient and doctor queue views in v1 | End-to-end queue transparency requires both sides to be operational | — Pending |
| Include reminders/notifications in v1 | Reduces no-shows and keeps queue changes visible to users | — Pending |
| Exclude online payments from v1 | Faster, lower-risk launch for core booking/queue workflows | — Pending |
| Exclude telemedicine/video from v1 | Keep first milestone focused and shippable | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-18 after initialization*
