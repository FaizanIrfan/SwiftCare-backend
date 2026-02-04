const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(
  process.env.GOOGLE_BACKEND_CLIENT_ID
);

module.exports = client;