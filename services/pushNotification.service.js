const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const DeviceToken = require('../models/deviceToken');

let initialized = false;
let initFailed = false;

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  const filePath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();

  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (error) {
        const guessedPath = path.resolve(raw);
        if (fs.existsSync(guessedPath)) {
          return JSON.parse(fs.readFileSync(guessedPath, 'utf8'));
        }
        throw error;
      }
    }
  }

  if (filePath) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }
  }

  return null;
}

function initFirebaseAdmin() {
  if (initialized || initFailed) return initialized;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      initFailed = true;
      console.warn('⚠️ FCM disabled: FIREBASE_SERVICE_ACCOUNT is not configured.');
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
    });

    initialized = true;
    console.log('✅ FCM Service successfully initialized.');
    return true;
  } catch (error) {
    initFailed = true;
    console.error('❌ FCM disabled: failed to initialize firebase-admin.', error.message);
    return false;
  }
}

function normalizeData(data) {
  const normalized = {};
  if (!data || typeof data !== 'object') return normalized;
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalized[key] = String(value);
  });
  return normalized;
}

async function sendPushNotification({ userId, title, body, data = {} }) {
  const ready = initFirebaseAdmin();
  if (!ready) return;

  const tokens = await DeviceToken.find({
    userId: String(userId),
    isActive: true
  }).lean();

  if (!tokens.length) return;

  const payload = {
    tokens: tokens.map((token) => token.token),
    notification: {
      title,
      body
    },
    data: normalizeData(data)
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(payload);
    if (response.failureCount === 0) return;

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[index]?.token);
      } else {
        console.error('FCM send error:', code);
      }
    });

    if (invalidTokens.length > 0) {
      await DeviceToken.updateMany(
        { userId: String(userId), token: { $in: invalidTokens } },
        { $set: { isActive: false, lastSeenAt: new Date() } }
      );
    }
  } catch (error) {
    console.error('FCM send failed:', error.message);
  }
}

module.exports = {
  initFirebaseAdmin,
  sendPushNotification
};
