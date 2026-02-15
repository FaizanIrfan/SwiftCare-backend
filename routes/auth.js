const express = require('express');
const bcrypt = require('bcrypt');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const { webClient } = require('../auth/google.client');
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
   SIMPLE SIGN IN
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
   SIMPLE SIGN-UP
-------------------------------------------------- */

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, roleHint } = req.body;

    // 1️⃣ Basic validation
    if (!name || !email || !password || !roleHint)
      return res.status(400).json({ error: 'All fields required' });

    // 2️⃣ Only patient allowed
    if (roleHint !== 'patient')
      return res.status(400).json({ error: 'Only patient signup allowed' });

    // 3️⃣ Check if email already exists
    const existingPatient = await Patient.findOne({
      'credentials.email': email
    });

    if (existingPatient)
      return res.status(409).json({ error: 'Email already registered' });

    // 4️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5️⃣ Create patient
    const user = await Patient.create({
      name,
      age: null,
      avatar: null,
      location: null,
      phone: null,
      gender: null,
      credentials: {
        email,
        password: hashedPassword,
        provider: 'local'
      }
    });

    // 6️⃣ Create tokens
    const jwtPayload = {
      sub: user._id.toString(),
      role: 'patient'
    };

    const accessToken = signAccessToken(jwtPayload);

    // 7️⃣ Store refresh token in cookie
    res.cookie('refreshToken', refreshCookieOptions);

    // 8️⃣ Send response
    res.status(201).json({
      accessToken,
      role: 'patient',
      userId: user._id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});


/* --------------------------------------------------
   GOOGLE SIGN-IN
-------------------------------------------------- */

router.post('/google', async (req, res) => {
  try {
    const { idToken, roleHint } = req.body;

    if (!idToken) return res.status(400).json({ error: 'idToken required' });

    const ticket = await webClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_BACKEND_CLIENT_ID
    });

    let user;
    if (roleHint == "patient") {
      const payload = ticket.getPayload();
      const { name, email, sub, picture } = payload; // here sub means password

      user = await Patient.findOne({ 'credentials.email': email });

      const hashedPassword = await bcrypt.hash(sub, 10);

      if (!user) {
        user = await Patient.create({
          name,
          avatar: picture,
          location: null,
          phone: null,
          age: null,
          gender: null,
          credentials: {
            email,
            password: hashedPassword,
            provider: 'google',
          }
        });
      }
    }

    const jwtPayload = {
      sub: user._id.toString(),
      roleHint
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.json({
      accessToken,
      roleHint,
      userId: user._id
    });

    console.log("Success");

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