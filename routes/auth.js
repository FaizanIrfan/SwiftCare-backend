const express = require('express');
const bcrypt = require('bcrypt');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const googleClient = require('../auth/google.client');
const {
  signAccessToken,
  signRefreshToken
} = require('../auth/token.service');
const { verifyRefreshToken } = require('../auth/token.service');

const router = express.Router();

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

  const payload = {
    sub: user._id.toString(),
    role
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Web: HttpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' ? true : false,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });


  res.json({
    accessToken,
    role,
    userId: user._id
  });
});

router.post('/google', async (req, res) => {
  try {
    const { idToken, roleHint } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_ANDROID_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub, email, name, picture } = payload;

    // 1️⃣ Try finding user in both Doctor and Patient
    let user = await Patient.findOne({ 'credentials.email': email });
    let role = 'patient'; // default

    if (!user) {
      // NEW USER → only patient sign-up allowed
      if (!roleHint || roleHint !== 'patient') {
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


    // 3️⃣ Issue tokens (SAME AS NORMAL LOGIN)
    const jwtPayload = {
      sub: user._id.toString(),
      role
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

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

router.post('/refresh', (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;

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

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.json({ success: true });
});

module.exports = router;