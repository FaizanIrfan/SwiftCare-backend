# External Integrations

**Analysis Date:** 2026-05-17

## APIs & External Services

**Payments:**
- Stripe - creates and verifies PaymentIntents for appointment payments.
  - SDK/Client: `stripe` in `services/paymentService.js`.
  - Auth: `STRIPE_SECRET_KEY` (`services/paymentService.js`).
  - Usage path: `POST /payment/create-intent` and `POST /payment/confirm` in `routes/payment.js`.

**Identity / Social Login:**
- Google Sign-In token verification for patient login/signup.
  - SDK/Client: `google-auth-library` in `auth/google.client.js`.
  - Auth: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (`auth/google.client.js`, `routes/auth.js`).
  - Usage path: `POST /auth/google` in `routes/auth.js`.

**AI/LLM:**
- Google Gemini API for chatbot responses.
  - SDK/Client: `@google/generative-ai` in `services/gemini.service.js`.
  - Auth: `GEMINI_API_KEY` (`services/gemini.service.js`).
  - Usage path: `POST /chatbot/chat` in `routes/chatbot.js`.

**Media Storage/CDN:**
- Cloudinary image upload for user profile images.
  - SDK/Client: `cloudinary` in `services/cloudinary.js`.
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
  - Usage path: `POST /api/user/upload-image` in `routes/user.js`.

**Geocoding:**
- Google Maps Geocoding API helper.
  - SDK/Client: HTTP call to `https://maps.googleapis.com/maps/api/geocode/json` in `services/geocode.js`.
  - Auth: `GOOGLE_MAPS_API_KEY`.
  - Note: helper exists in `services/geocode.js`; no route wiring detected in current route files.

**Email Delivery:**
- SMTP relay for OTP and password reset emails.
  - SDK/Client: `nodemailer` in `services/email.service.js`.
  - Auth: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, optional `MAIL_FROM`.
  - Usage path: OTP/password routes in `routes/auth.js`.

**Push Notifications:**
- Firebase Cloud Messaging for mobile/web push.
  - SDK/Client: `firebase-admin` in `services/pushNotification.service.js`.
  - Auth: `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_PATH`, optional `FIREBASE_PROJECT_ID`.
  - Trigger path: `createNotification` in `services/notification.service.js` calls `sendPushNotification`.

## Data Storage

**Databases:**
- MongoDB via Mongoose ODM.
  - Connection: `MONGO_URI` in `index.js` (database name forced to `PerfectData`).
  - Client: `mongoose` schemas/models in `models/*.js` (examples: `models/doctor.js`, `models/appointment.js`).

**File Storage:**
- Hybrid:
  - Cloudinary for profile images (`services/cloudinary.js`, `routes/user.js`).
  - Local filesystem `uploads/` served from `/uploads` (`index.js`, `routes/verification.js`).

**Caching:**
- None detected (no Redis/memcached client usage in repo files).

## Authentication & Identity

**Auth Provider:**
- Custom JWT auth with optional Google federated login.
  - Implementation: access/refresh token signing in `auth/token.service.js`, guard middleware in `auth/auth.middleware.js`, refresh cookie flow in `routes/auth.js`.
  - External identity validation: Google ID token verification in `routes/auth.js` via `auth/google.client.js`.

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Bugsnag/New Relic integration files).

**Logs:**
- Console logging only (`console.log`, `console.error`) across `index.js`, `routes/*.js`, `services/*.js`.

## CI/CD & Deployment

**Hosting:**
- Not explicitly declared (no deployment manifest/Dockerfile in repo root).

**CI Pipeline:**
- Not detected (no `.github/workflows/*` in current repository tree snapshot).

## Environment Configuration

**Required env vars:**
- Core runtime: `PORT`, `NODE_ENV`, `MONGO_URI`, `CORS_ORIGINS`, `CORS_ALLOW_ALL` (`index.js`).
- Auth/security: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USER_IDS` (`auth/*.js`, `routes/auth.js`, `services/notification.targets.js`).
- Stripe: `STRIPE_SECRET_KEY` (`services/paymentService.js`).
- Google auth: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (`auth/google.client.js`, `routes/auth.js`).
- Gemini: `GEMINI_API_KEY` (`services/gemini.service.js`).
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (`services/cloudinary.js`).
- FCM: `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_PATH`, optional `FIREBASE_PROJECT_ID` (`services/pushNotification.service.js`).
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, optional `MAIL_FROM` (`services/email.service.js`).
- Scheduler feature flag: `NOTIFICATION_SCHEDULER_ENABLED` (`services/notificationScheduler.js`).
- Geocoding: `GOOGLE_MAPS_API_KEY` (`services/geocode.js`).

**Secrets location:**
- Root `.env` file (present) and process environment at runtime; `.env` is ignored in `.gitignore`.

## Webhooks & Callbacks

**Incoming:**
- None detected (no webhook endpoint such as Stripe webhook route/signature verification in `routes/*.js`).

**Outgoing:**
- Stripe API calls from `services/paymentService.js`.
- Google Gemini API calls from `services/gemini.service.js`.
- Google OAuth token verification from `routes/auth.js`.
- Google Maps Geocoding HTTP call from `services/geocode.js`.
- Cloudinary upload API calls from `services/cloudinary.js`.
- SMTP mail relay calls from `services/email.service.js`.
- Firebase Admin FCM send calls from `services/pushNotification.service.js`.

---

*Integration audit: 2026-05-17*
