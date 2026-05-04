const { OAuth2Client } = require('google-auth-library');

const androidClient = new OAuth2Client(process.env.GOOGLE_ANDROID_CLIENT_ID);
// Use GOOGLE_WEB_CLIENT_ID for verifying tokens from the web frontend
const webClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

module.exports = { androidClient, webClient };
