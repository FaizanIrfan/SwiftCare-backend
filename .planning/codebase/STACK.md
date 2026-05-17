# Technology Stack

**Analysis Date:** 2026-05-17

## Languages

**Primary:**
- JavaScript (Node.js CommonJS) - API server and business logic in `index.js`, `routes/*.js`, `services/*.js`, `models/*.js`.

**Secondary:**
- EJS templates - server-rendered health/landing page in `views/main.ejs` with view engine setup in `index.js`.
- HTML/CSS - static markup/styles in `views/main.ejs`.

## Runtime

**Environment:**
- Node.js `>=18` (from `package.json` `engines.node`).

**Package Manager:**
- npm (lockfile format v3 in `package-lock.json` indicates modern npm lockfile).
- Lockfile: present (`package-lock.json`).

## Frameworks

**Core:**
- Express `^4.18.2` - HTTP API and routing (`index.js`, `routes/*.js`).
- Mongoose `^8.20.0` - MongoDB ODM for schemas/models (`models/*.js`, `index.js`).
- Socket.IO `^4.8.3` - realtime queue/notification transport (`index.js`, `socket/sockethandler.js`, `services/realtimeEvents.js`).

**Testing:**
- Not detected (no `jest.config.*`, `vitest.config.*`, or test script in `package.json`).

**Build/Dev:**
- No build pipeline detected; app runs directly with Node (`package.json` script `start: node index.js`).
- dotenv `^17.2.3` for runtime env loading at process boot (`index.js`).

## Key Dependencies

**Critical:**
- `express` `^4.18.2` - request lifecycle and middleware stack in `index.js`.
- `mongoose` `^8.20.0` - persistent data layer (`models/appointment.js`, `models/doctor.js`, `models/patient.js`).
- `jsonwebtoken` `^9.0.3` - JWT auth tokens (`auth/token.service.js`, `auth/auth.middleware.js`, `socket/sockethandler.js`).
- `bcrypt` `^6.0.0` - password hashing and credential checks (`models/doctor.js`, `models/patient.js`, `routes/auth.js`).

**Infrastructure:**
- `stripe` `^20.3.1` - payment intents (`services/paymentService.js`, `routes/payment.js`).
- `cloudinary` `^2.6.1` - image upload/storage (`services/cloudinary.js`, `routes/user.js`).
- `firebase-admin` `^13.10.0` - FCM push delivery (`services/pushNotification.service.js`).
- `google-auth-library` `^10.5.0` - Google ID token verification (`auth/google.client.js`, `routes/auth.js`).
- `@google/generative-ai` `^0.24.1` - chatbot inference (`services/gemini.service.js`, `routes/chatbot.js`).
- `nodemailer` `^8.0.4` - OTP/reset mail delivery (`services/email.service.js`, `routes/auth.js`).
- `multer` `^2.1.1` - multipart uploads (`routes/user.js`, `routes/verification.js`).
- `cors` `^2.8.5`, `cookie-parser` `^1.4.7`, `ejs` `^4.0.1` - API boundary and rendering (`index.js`).

## Configuration

**Environment:**
- Environment bootstrapped via `.env` file and `require('dotenv').config()` in `index.js`.
- `.env` file exists at repo root and is ignored by git via `.gitignore`.
- Key runtime configs are read from env in `index.js`, `services/*.js`, `auth/*.js`, `routes/auth.js`.

**Build:**
- No TypeScript/Babel/Webpack/Vite config detected in repo root.
- Entrypoint is `index.js` (`package.json` `main`, `scripts.start`).

## Platform Requirements

**Development:**
- Node.js 18+ and npm.
- Running MongoDB connection string required (`process.env.MONGO_URI` consumed in `index.js`).

**Production:**
- Long-running Node process serving HTTP + Socket.IO from one server (`index.js`).
- Deployment target is not explicitly configured (no Dockerfile/CI workflow files detected in project root).

---

*Stack analysis: 2026-05-17*
