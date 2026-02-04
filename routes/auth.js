const express = require('express');
const bcrypt = require('bcrypt');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const googleClient = require('../auth/google.client');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require('../auth/token.service');

const router = express.Router();

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

const isProd = process.env.NODE_ENV === 'production';

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
};

/* --------------------------------------------------
   LOGIN (Email + Password)
-------------------------------------------------- */

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  let user = await Doctor.findOne({ 'credentials.email': email });
  let role = 'doctor';

  if (!user) {
    user = await Patient.findOne({ 'credentials.email': email });
    role = 'patient';
  }

  if (!user)
    return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.credentials.password);
  if (!match)
    return res.status(401).json({ error: 'Invalid credentials' });

  const jwtPayload = {
    sub: user._id.toString(),
    role
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  // Web: refresh token via HttpOnly cookie
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  // Flutter: access token via JSON
  res.json({
    accessToken,
    role,
    userId: user._id
  });
});

/* --------------------------------------------------
   GOOGLE SIGN-IN
-------------------------------------------------- */

router.post('/google', async (req, res) => {
  try {
    const { idToken, roleHint } = req.body;

    if (!idToken)
      return res.status(400).json({ error: 'idToken required' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_BACKEND_CLIENT_ID
    });


    const payload = ticket.getPayload();
    const { sub, email, name, picture } = payload;

    let user = await Patient.findOne({ 'credentials.email': email });
    let role = 'patient';

    if (!user) {
      if (roleHint !== 'patient') {
        return res.status(400).json({
          error: 'New users can only be patients via Google Sign-In'
        });
      }

      user = await Patient.create({
        name,
        avatar: picture,
        credentials: {
          email,
          password: null,
          provider: 'google',
          googleId: sub
        }
      });
    }

    const jwtPayload = {
      sub: user._id.toString(),
      role
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.json({
      accessToken,
      role,
      userId: user._id
    });

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

/* --------------------------------------------------
   REFRESH ACCESS TOKEN (Web + Flutter)
-------------------------------------------------- */

router.post('/refresh', (req, res) => {
  const authHeader = req.headers.authorization;

  const token =
    req.cookies.refreshToken ||
    (authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null) ||
    req.body.refreshToken;

  if (!token)
    return res.status(401).json({ error: 'No refresh token' });

  try {
    const decoded = verifyRefreshToken(token);

    const accessToken = signAccessToken({
      sub: decoded.sub,
      role: decoded.role
    });

    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/* --------------------------------------------------
   LOGOUT
-------------------------------------------------- */

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', refreshCookieOptions);
  res.json({ success: true });
});

module.exports = router;