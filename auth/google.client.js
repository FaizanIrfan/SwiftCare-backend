const { OAuth2Client } = require('google-auth-library');

const androidClient = new OAuth2Client(process.env.GOOGLE_ANDROID_CLIENT_ID);
const webClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

const backendPublicUrl = String(
  process.env.BACKEND_PUBLIC_URL || 'https://swiftcare.up.railway.app'
).replace(/\/+$/, '');

const googleWebRedirectUri = `${backendPublicUrl}/auth/google/web/callback`;

const webOAuthClient = new OAuth2Client(
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_SECRET,
  googleWebRedirectUri
);

module.exports = {
  androidClient,
  webClient,
  webOAuthClient,
  googleWebRedirectUri,
  backendPublicUrl,
};
