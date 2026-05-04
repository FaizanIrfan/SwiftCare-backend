# SwiftCare Backend Map

Backend architecture and API contract map synced to current source code.

## 1) Service Identity
- Runtime: Node.js `>=18`
- Framework: Express (`CommonJS`)
- Database: MongoDB via Mongoose (`dbName: PerfectData`)
- Entry: `index.js`
- Default port: `process.env.PORT` fallback `5000`
- Health endpoint: `GET /healthz`

## 2) Route Mounts
- `/auth` -> `routes/auth.js`
- `/queue` -> `routes/queue.js`
- `/api/user` -> `routes/user.js`
- `/doctors` -> `routes/doctors.js`
- `/doctors/verification` -> `routes/verification.js`
- `/reviews` -> `routes/reviews.js`
- `/chatbot` -> `routes/chatbot.js`
- `/payment` -> `routes/payment.js`
- `/patients` -> `routes/patients.js`
- `/appointments` -> `routes/appointments.js`
- `/shifts` -> `routes/shifts.js`
- `/notifications` -> `routes/notifications.js`
- `/uploads` -> static file hosting for verification uploads

## 3) Auth Contract
- Access token: JWT signed with `ACCESS_TOKEN_SECRET`
- Access token TTL: `15m`
- Refresh token: JWT signed with `REFRESH_TOKEN_SECRET`
- Refresh token TTL: `30d`

`requireAuth` token sources:
1. `Authorization: Bearer <accessToken>`
2. Cookie `accessToken`

Injected identity claims:
- `req.user.sub`
- `req.user.role` as `patient | doctor | admin`

Refresh endpoint (`POST /auth/refresh`) token sources:
1. Cookie `refreshToken`
2. `Authorization: Bearer <refreshToken>`

## 4) Access Control Matrix
Public routes:
- `/auth/*`
- `GET /doctors`
- `GET /doctors/:id`
- `GET /reviews`
- `POST /payment/create-intent`
- `POST /chatbot/chat`

Auth-protected route groups:
- `/api/user/*`
- `/doctors/nearby`
- `PUT /doctors/:id`
- `/patients/*`
- `/appointments/*`
- `/shifts/*`
- `/queue/*`
- `/notifications/*`
- `/doctors/verification/*`
- `POST /reviews`
- `DELETE /reviews/:id`
- `PATCH /reviews/:id/respond`
- `POST /payment/confirm`

Ownership and role checks:
- Doctor profile update: doctor self or admin
- Patient read/update/location: patient self or admin
- Patient delete: admin only
- Verification submit: same doctor or admin
- Verification status update, approve, reject: admin only
- Appointment create: patient self or admin
- Appointment status update: appointment doctor or admin
- Doctor patient list from appointments: same doctor or admin
- Appointment shift list endpoint `GET /appointments/doctor/:doctorId`: auth required, no ownership check in current code
- Shift create, active lookup, upcoming lookup, start, end: same doctor or admin
- Queue start, next, end: `doctor` role only
- Queue patients list: auth only
- Review create: auth required (no owner-match enforcement on `patientId` in current code)
- Review delete: review owner patient or admin
- Review respond: admin only
- Payment confirm: appointment patient or doctor owner, or admin

## 5) Endpoint Inventory
### Auth
- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/verify-email-otp`
- `POST /auth/google`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

### User
- `POST /api/user/profile`
- `POST /api/user/toggle-favorite`
- `POST /api/user/upload-image`

### Doctors
- `GET /doctors`
- `GET /doctors/nearby?lat=&lng=`
- `GET /doctors/:id`
- `PUT /doctors/:id`

### Verification
- `GET /doctors/verification`
- `POST /doctors/verification/submit`
- `PUT /doctors/verification/:id`
- `PUT /doctors/verification/:id/approve`
- `PUT /doctors/verification/:id/reject`

### Patients
- `GET /patients`
- `PUT /patients/location/:id`
- `GET /patients/:id`
- `PUT /patients/:id`
- `DELETE /patients/:id`

### Appointments
- `GET /appointments/doctor/:doctorId`
- `GET /appointments/available-slots`
- `POST /appointments`
- `GET /appointments`
- `PUT /appointments/:id/status`
- `GET /appointments/doctor/:doctorId/patients`

### Shifts
- `POST /shifts`
- `GET /shifts/active`
- `GET /shifts/upcoming`
- `POST /shifts/start`
- `POST /shifts/end`

### Queue
- `POST /queue/start-shift`
- `POST /queue/next`
- `POST /queue/end-shift`
- `POST /queue/patients`

### Reviews
- `POST /reviews`
- `GET /reviews`
- `DELETE /reviews/:id`
- `PATCH /reviews/:id/respond`

### Payment
- `POST /payment/create-intent`
- `POST /payment/confirm`

### Notifications
- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `POST /notifications/devices`
- `POST /notifications/devices/deactivate`
- `POST /notifications/test`

### Chatbot
- `POST /chatbot/chat`

## 6) Operational Contracts
- Pagination routes use query keys `page` and `limit` with route-specific defaults and max values
- Appointment slot generation uses 10-minute intervals from shift `startTime` to `endTime`
- Appointment booking rejects if shift has ended, date mismatch, doctor mismatch, or slot not on valid boundary
- Queue progression excludes cancelled appointments
- Notification listing is scoped strictly to authenticated `userId`
- Payment confirmation validates Stripe payment intent status, amount, and currency before success

## 7) Real-Time Contract
Socket handshake auth supports:
- `socket.handshake.auth.token`
- Bearer header token

Client events:
- `joinQueueRoom(shiftId)`
- `joinUserRoom(userId)`

Server events:
- `queueUpdated`
- `bookingUpdated`
- `notification:new`

## 8) Core Data Shapes
### Doctor
- `location.geo.coordinates` GeoJSON `[lng, lat]`
- `schedule.availableDays[]`
- `schedule.availableHours[]`
- `accountStatus.verificationStatus`

### Patient
- profile fields plus `location.coordinates` and `favorites[]`

### Shift
- `doctorId`, `date`, `startTime`, `endTime`, `status`

### Appointment
- `patientId`, `doctorId`, `shiftId`, `queueNumber`, `date`, `time`
- `status` enum: `pending | completed | cancelled`
- unique slot protection by doctor/date/shift/time through DB constraints

### Notification
- `userId`, `role`, `type`, `title`, `body`, `data`, `read`, `readAt`

## 9) Integrations
- Stripe via `services/paymentService.js`
- Google ID token verification via `auth/google.client.js`
- Gemini via `services/gemini.service.js`
- Cloudinary image upload via `services/cloudinary.js`
- SMTP email/OTP via `services/email.service.js`
- Notification scheduler via `services/notificationScheduler.js`

## 10) Environment Variables
- `PORT`, `MONGO_URI`
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USER_IDS`
- `CORS_ORIGINS`, `CORS_ALLOW_ALL`
- `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_BACKEND_CLIENT_ID`
- `GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `NOTIFICATION_SCHEDULER_ENABLED`
- `NODE_ENV`

## 11) Known Behavior Notes
- `/appointments/doctor/:doctorId` currently returns shifts and does not enforce doctor/admin ownership
- `/queue/patients` is auth-protected but not doctor-role-protected
- `POST /notifications/test` is admin-only only when `NODE_ENV=production`

Last synced: 2026-04-06
