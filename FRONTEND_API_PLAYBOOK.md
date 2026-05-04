# SwiftCare Frontend API Playbook

Execution contract for Flutter/mobile integration. Synced with current backend source.

## 1) Base Rules
- Base URL: `http(s)://<host>:<port>`
- Access token transport: `Authorization: Bearer <accessToken>`
- Refresh token transport for `POST /auth/refresh`:
1. Cookie `refreshToken`
2. Header `Authorization: Bearer <refreshToken>`
- JSON routes require `Content-Type: application/json`
- Upload routes require `multipart/form-data`
- On `401`, run refresh flow and retry once
- Backend error key priority for UI:
1. `error`
2. `message`
3. fallback generic

## 2) Auth Contract
### `POST /auth/login`
Body:
```json
{ "email": "user@x.com", "password": "secret" }
```
Success:
```json
{ "refreshToken": "...", "accessToken": "...", "role": "patient|doctor|admin", "userId": "..." }
```

### `POST /auth/signup`
Body:
```json
{
  "name": "...",
  "email": "...",
  "password": "...",
  "roleHint": "patient|doctor",
  "location": { "label": "...", "coordinates": [74.3, 31.5] },
  "schedule": { "availableDays": ["Mon"], "availableHours": ["09:00 AM - 05:00 PM"] }
}
```
Notes:
- `location` and valid `schedule` are required for `doctor` signup
- Returns verification pending response (`message`, `email`, `role`, `userId`)

### `POST /auth/verify-email-otp`
Body:
```json
{ "email": "...", "roleHint": "patient|doctor", "otp": "123456" }
```
Success returns token payload same as login.

### `POST /auth/google`
Body:
```json
{ "idToken": "...", "roleHint": "patient" }
```
Note: only patient flow is implemented.

### `POST /auth/refresh`
Body: none required.
Success:
```json
{ "accessToken": "..." }
```

### `POST /auth/logout`
Success:
```json
{ "success": true }
```

### `POST /auth/forgot-password`
Body:
```json
{ "email": "...", "roleHint": "patient|doctor" }
```
Success:
```json
{ "message": "If an account exists, a reset code was sent" }
```

### `POST /auth/reset-password`
Body:
```json
{ "email": "...", "roleHint": "patient|doctor", "otp": "123456", "newPassword": "..." }
```

## 3) Authorization Summary
- Public routes:
- `/auth/*`
- `GET /doctors`
- `GET /doctors/:id`
- `GET /reviews`
- `POST /payment/create-intent`
- `POST /chatbot/chat`
- Auth required on all routes under `/api/user`, `/patients`, `/appointments`, `/shifts`, `/queue`, `/notifications`, `/doctors/verification`
- Auth required for `GET /doctors/nearby` and `PUT /doctors/:id`
- Ownership and role constraints:
- Doctor update: self or admin
- Patient read/update/location: self or admin
- Patient delete: admin
- Verification admin updates: admin
- Verification submit: doctor self or admin
- Appointment create: patient self or admin
- Appointment status update: appointment doctor or admin
- `GET /appointments/doctor/:doctorId/patients`: same doctor or admin
- `GET /appointments/doctor/:doctorId`: auth required, no ownership check in current code
- Shift create/read/manage: same doctor or admin
- Queue `start-shift`, `next`, `end-shift`: doctor role
- Queue `patients`: auth only
- Review create: auth required (no owner-match enforcement on `patientId` in current code)
- Review delete: review owner patient or admin
- Review respond: admin
- Payment confirm: appointment patient/doctor/admin

## 4) Endpoint Matrix
### User (`/api/user`)
- `POST /profile`
- `POST /toggle-favorite`
- `POST /upload-image`

### Doctors (`/doctors`)
- `GET /` (public)
- `GET /nearby?lat=&lng=` (auth)
- `GET /:id` (public)
- `PUT /:id` (auth; doctor self/admin)

### Verification (`/doctors/verification`)
- `GET /`
- `POST /submit`
- `PUT /:id`
- `PUT /:id/approve`
- `PUT /:id/reject`

### Patients (`/patients`)
- `GET /`
- `PUT /location/:id`
- `GET /:id`
- `PUT /:id`
- `DELETE /:id`

### Appointments (`/appointments`)
- `GET /doctor/:doctorId`
- `GET /available-slots`
- `POST /`
- `GET /`
- `PUT /:id/status`
- `GET /doctor/:doctorId/patients`

### Shifts (`/shifts`)
- `POST /`
- `GET /active`
- `GET /upcoming`
- `POST /start`
- `POST /end`

### Queue (`/queue`)
- `POST /start-shift`
- `POST /next`
- `POST /end-shift`
- `POST /patients`

### Reviews (`/reviews`)
- `POST /` (auth)
- `GET /`
- `DELETE /:id`
- `PATCH /:id/respond`

### Payment (`/payment`)
- `POST /create-intent`
- `POST /confirm`

### Notifications (`/notifications`)
- `GET /`
- `GET /unread-count`
- `PATCH /:id/read`
- `PATCH /read-all`
- `POST /devices`
- `POST /devices/deactivate`
- `POST /test`

### Chatbot (`/chatbot`)
- `POST /chat`

## 5) Critical Request Contracts
### `POST /api/user/toggle-favorite`
Body:
```json
{ "patientId": "...", "doctorId": "..." }
```

### `POST /api/user/upload-image`
Multipart fields:
- `image` required, image MIME, max `5MB`

### `GET /doctors/nearby`
Query:
- `lat` valid latitude
- `lng` valid longitude

### `POST /doctors/verification/submit`
Multipart fields:
- `doctorId` required
- JSON-string optional fields: `identification`, `professionalInfo`, `schedule`
- Files: `profilePic`, `cnicFront`, `cnicBack`, `degreeCert`, `regCert`, `otherCerts`
- Per-file max size `1MB`
- Allowed file types: `image/png`, `image/jpeg`, `application/pdf`

### `PUT /patients/location/:id`
Body:
```json
{ "label": "Home", "coordinates": [74.3, 31.5] }
```

### `GET /appointments/available-slots`
Query:
- `doctorId` required
- `date` required
- `shiftId` required
Success:
```json
{
  "doctorId": "...",
  "date": "...",
  "shiftId": "...",
  "slotDurationMinutes": 10,
  "totalSlots": 12,
  "bookedSlots": ["09:00 AM"],
  "freeSlots": ["09:10 AM"]
}
```

### `POST /appointments`
Body required minimum:
```json
{ "patientId": "...", "doctorId": "...", "shiftId": "...", "date": "...", "time": "09:00 AM" }
```
Notes:
- Slot must align to 10-minute boundary inside shift window
- Appointment `date` must equal shift date
- Queue number is assigned server-side

### `GET /appointments`
Query:
- `page` default `1`
- `limit` default `20`, max `100`
Success:
```json
{ "page": 1, "limit": 20, "totalCount": 5, "items": [] }
```

### `GET /appointments/doctor/:doctorId`
- Returns shift list for doctor
- Sorted by `date` descending, then `startTime` ascending

### `PUT /appointments/:id/status`
Body:
```json
{ "status": "pending|completed|cancelled", "consultationNotes": "optional" }
```

### `POST /shifts`
Body:
```json
{ "doctorId": "...", "date": "...", "startTime": "09:00 AM", "endTime": "05:00 PM" }
```

### `GET /shifts/active`
Query:
- `doctorId` required

### `GET /shifts/upcoming`
Query:
- `doctorId` required
- `date` optional

### `POST /shifts/start`
Body:
```json
{ "shiftId": "..." }
```

### `POST /shifts/end`
Body:
```json
{ "shiftId": "..." }
```

### `POST /queue/start-shift`
Body:
```json
{ "shiftId": "..." }
```

### `POST /queue/next`
Body:
```json
{ "shiftId": "..." }
```
Success:
```json
{ "message": "Queue updated", "currentServing": 3, "currentAppointment": { } }
```

### `POST /queue/end-shift`
Body:
```json
{ "shiftId": "..." }
```

### `POST /queue/patients`
Body:
```json
{ "shiftId": "..." }
```
Success includes `currentServing` and `patients[]` with computed `isServed`.

### `GET /reviews`
Query:
- `page` default `1`
- `limit` default `20`, max `100`
Success:
```json
{ "page": 1, "limit": 20, "totalCount": 5, "items": [] }
```

### `POST /payment/create-intent`
Body:
```json
{ "amount": 2500, "appointmentId": "optional" }
```
Success:
```json
{ "clientSecret": "...", "paymentIntentId": "pi_..." }
```

### `POST /payment/confirm`
Body:
```json
{ "appointmentId": "...", "amount": 2500, "currency": "pkr", "paymentIntentId": "pi_...", "status": "succeeded" }
```
Notes:
- Backend verifies Stripe intent status, amount and currency before confirming

### `GET /notifications`
Query:
- `page` default `1`
- `limit` default `20`, max `100`
- `unreadOnly` optional boolean string
- `type` optional
Success:
```json
{ "page": 1, "limit": 20, "total": 3, "totalPages": 1, "items": [] }
```

### `POST /notifications/devices`
Body:
```json
{ "token": "...", "platform": "android|ios|web" }
```

### `POST /notifications/devices/deactivate`
Body:
```json
{ "token": "..." }
```

### `POST /notifications/test`
Body optional:
```json
{ "title": "...", "body": "...", "data": { "appointmentId": "...", "doctorId": "...", "patientId": "...", "shiftId": "...", "type": "...", "meta": {} } }
```
Note: in production this route is admin-only.

### `POST /chatbot/chat`
Body:
```json
{ "message": "..." }
```
Success:
```json
{ "reply": "..." }
```

## 6) Socket.IO Contract
Handshake auth:
- `auth: { token: <accessToken> }`
- or bearer header

Client events:
- `joinQueueRoom(shiftId)`
- `joinUserRoom(userId)`

Server events and payloads:
- `queueUpdated`
```json
{ "shiftId": "...", "currentServing": 5 }
```
- `bookingUpdated`
```json
{ "shiftId": "...", "currentServing": 2, "totalPatients": 10, "patients": [] }
```
- `notification:new`
```json
{ "_id": "...", "userId": "...", "type": "...", "title": "...", "body": "...", "read": false }
```

## 7) Data And Parsing Notes
- IDs are Mongo ObjectId strings
- Appointment status enum is lowercase: `pending`, `completed`, `cancelled`
- Shift status enum used in APIs: `scheduled`, `active`, `ended`
- Appointment times are 12-hour strings in shifts flow, example `09:10 AM`
- Some APIs return document arrays directly, others return wrappers with pagination keys

## 8) Common Error Statuses
- `400` validation/input mismatch
- `401` missing, invalid, or expired token
- `403` role/ownership forbidden
- `404` entity not found
- `409` conflict or invalid state transition
- `500` unexpected backend failure

## 9) Frontend Implementation Checklist
- Add auth interceptor and one-time refresh retry
- Distinguish `401` from `403` in UX
- Normalize date/time formatting before calling slot and shift APIs
- Build per-endpoint parsers because response wrappers vary
- Subscribe to queue and notification socket events after successful auth

Last synced: 2026-04-06
