const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_ANDROID_CLIENT_ID); // your Android client ID

module.exports = client;