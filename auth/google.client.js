const { OAuth2Client } = require('google-auth-library');

const androidClient = new OAuth2Client(process.env.GOOGLE_ANDROID_CLIENT_ID);
const webClient = new OAuth2Client(process.env.GOOGLE_BACKEND_CLIENT_ID);

module.exports = { androidClient, webClient };
