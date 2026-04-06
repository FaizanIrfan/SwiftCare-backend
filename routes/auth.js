const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const EmailOtp = require('../models/emailOtp');
const { webClient } = require('../auth/google.client');
const { sendEmail, smtpConfigured } = require('../services/email.service');
const {
  normalizeStringArray,
  validateDoctorSchedule,
  ensureDoctorFutureShifts
} = require('../services/shiftScheduler');
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

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_ID = 'admin-swiftcare-001';
const OTP_TTL_MINUTES = 10;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeStringEquals(left, right) {
  const leftDigest = Buffer.from(sha256Hex(left), 'hex');
  const rightDigest = Buffer.from(sha256Hex(right), 'hex');
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

const buildOtpEmailHtml = ({ name, otp, minutes }) => {
  const safeName = String(name || '').trim() || 'there';
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SwiftCare Email Verification</title>
  </head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#102a43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(16,42,67,0.08);">
            <tr>
              <td style="background:#0b6dff;padding:20px 28px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">SwiftCare</div>
                <div style="font-size:12px;opacity:0.9;">Your trusted medical platform</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:16px;margin-bottom:10px;">Hi ${safeName},</div>
                <div style="font-size:14px;line-height:1.6;color:#334e68;margin-bottom:16px;">
                  Use the verification code below to complete your SwiftCare registration. This code expires in ${minutes} minutes.
                </div>
                <div style="background:#f0f4ff;border:1px solid #d8e1ff;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
                  <div style="font-size:12px;color:#486581;margin-bottom:6px;">VERIFICATION CODE</div>
                  <div style="font-size:28px;letter-spacing:6px;font-weight:700;color:#102a43;">${otp}</div>
                </div>
                <div style="font-size:13px;color:#627d98;line-height:1.5;">
                  If you didn’t request this, you can safely ignore this email.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;color:#829ab1;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} SwiftCare. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
};

const buildPasswordResetEmailHtml = ({ name, otp, minutes }) => {
  const safeName = String(name || '').trim() || 'there';
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SwiftCare Password Reset</title>
  </head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#102a43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(16,42,67,0.08);">
            <tr>
              <td style="background:#0b6dff;padding:20px 28px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">SwiftCare</div>
                <div style="font-size:12px;opacity:0.9;">Secure password recovery</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:16px;margin-bottom:10px;">Hi ${safeName},</div>
                <div style="font-size:14px;line-height:1.6;color:#334e68;margin-bottom:16px;">
                  We received a request to reset your SwiftCare password. Use the code below to continue. This code expires in ${minutes} minutes.
                </div>
                <div style="background:#fff4f0;border:1px solid #ffd9cc;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
                  <div style="font-size:12px;color:#9c4221;margin-bottom:6px;">RESET CODE</div>
                  <div style="font-size:28px;letter-spacing:6px;font-weight:700;color:#7b341e;">${otp}</div>
                </div>
                <div style="font-size:13px;color:#627d98;line-height:1.5;">
                  If you didn’t request this, ignore this email and your password will remain unchanged.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;color:#829ab1;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} SwiftCare. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
};

/* --------------------------------------------------
   SIMPLE SIGN IN
-------------------------------------------------- */

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password)
    return res.status(400).json({ error: 'Email and password required' });

  if (
    ADMIN_EMAIL &&
    ADMIN_PASSWORD &&
    safeStringEquals(normalizedEmail, ADMIN_EMAIL) &&
    safeStringEquals(password, ADMIN_PASSWORD)
  ) {
    const jwtPayload = { sub: ADMIN_ID, role: 'admin' };
    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);
    return res.json({ refreshToken, accessToken, role: 'admin', userId: ADMIN_ID });
  }

  let user = await Doctor.findOne({ 'credentials.email': normalizedEmail });
  let role = 'doctor';

  if (!user) {
    user = await Patient.findOne({ 'credentials.email': normalizedEmail });
    role = 'patient';
  }

  if (!user)
    return res.status(401).json({ error: 'User not found' });

  const match = await bcrypt.compare(password, user.credentials.password);
  if (!match)
    return res.status(401).json({ error: 'Invalid credentials' });

  if (user.credentials.provider === 'local' && user.credentials.emailVerified === false)
    return res.status(403).json({ error: 'Email not verified' });

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
    refreshToken,
    accessToken,
    role,
    userId: user._id
  });
});

/* --------------------------------------------------
   SIMPLE SIGN-UP (1)
-------------------------------------------------- */

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, roleHint } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const availableDays = normalizeStringArray(req.body.schedule?.availableDays);
    const availableHours = normalizeStringArray(req.body.schedule?.availableHours);
    const locationLabel = req.body.location?.label;
    const locationCoordinates = req.body.location?.coordinates;
    let parsedDoctorCoordinates = null;

    if (!name || !normalizedEmail || !password || !roleHint)
      return res.status(400).json({ error: 'All fields required' });

    if (roleHint !== 'patient' && roleHint !== 'doctor')
      return res.status(400).json({ error: 'Invalid role' });

    if (roleHint === 'doctor') {
      if (!locationLabel || !Array.isArray(locationCoordinates) || locationCoordinates.length !== 2) {
        return res.status(400).json({
          error: 'Doctor signup requires location.label and location.coordinates [longitude, latitude]'
        });
      }

      const [longitude, latitude] = locationCoordinates.map(Number);
      parsedDoctorCoordinates = [longitude, latitude];
      const validCoordinates =
        Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90;

      if (!validCoordinates) {
        return res.status(400).json({
          error: 'Invalid location.coordinates. Expected [longitude, latitude] numeric values'
        });
      }

      const scheduleValidation = validateDoctorSchedule(availableDays, availableHours);
      if (!scheduleValidation.ok) {
        return res.status(400).json({ error: scheduleValidation.message });
      }
    }

    if (!smtpConfigured)
      return res.status(500).json({ error: 'Email service not configured' });

    const existingPatient = await Patient.findOne({
      'credentials.email': normalizedEmail
    });
    const existingDoctor = await Doctor.findOne({
      'credentials.email': normalizedEmail
    });

    const existingUser = roleHint === 'patient' ? existingPatient : existingDoctor;
    const otherRoleUser = roleHint === 'patient' ? existingDoctor : existingPatient;

    if (otherRoleUser)
      return res.status(409).json({ error: 'Email already registered with another role' });

    if (existingUser && existingUser.credentials.emailVerified)
      return res.status(409).json({ error: 'Email already registered' });

    let userId;
    let createdUser = false;

    if (!existingUser) {
      if (roleHint === 'patient') {
        const user = await Patient.create({
          name,
          location: null,
          phone: null,
          age: null,
          gender: null,
          image: null,
          favorites: [],
          credentials: {
            email: normalizedEmail,
            password,
            provider: 'local',
            emailVerified: false
          }
        });
        userId = user._id;
      } else {
        const doctor = await Doctor.create({
          name,
          specialization: 'General Physician',
          location: {
            label: locationLabel,
            geo: {
              type: 'Point',
              coordinates: parsedDoctorCoordinates
            }
          },
          schedule: {
            availableDays,
            availableHours
          },
          accountStatus: {
            registered: true,
            verificationStatus: 'pending'
          },
          credentials: {
            email: normalizedEmail,
            password,
            provider: 'local',
            emailVerified: false
          }
        });
        await ensureDoctorFutureShifts({
          doctorId: doctor._id.toString(),
          availableDays: doctor.schedule?.availableDays,
          availableHours: doctor.schedule?.availableHours
        });
        userId = doctor._id;
      }
      createdUser = true;
    } else {
      userId = existingUser._id;
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await EmailOtp.deleteMany({
      userId,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'signup'
    });

    await EmailOtp.create({
      userId,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'signup',
      otpHash,
      expiresAt
    });

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: 'Your SwiftCare verification code',
        text: `Your verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        html: buildOtpEmailHtml({ name, otp, minutes: OTP_TTL_MINUTES })
      });
    } catch (emailError) {
      await EmailOtp.deleteMany({
        userId,
        email: normalizedEmail,
        role: roleHint,
        purpose: 'signup'
      });
      if (createdUser) {
        if (roleHint === 'patient') {
          await Patient.deleteOne({ _id: userId });
        } else {
          await Doctor.deleteOne({ _id: userId });
        }
      }
      throw emailError;
    }

    res.status(existingUser ? 202 : 201).json({
      message: 'Verification code sent',
      email: normalizedEmail,
      role: roleHint,
      userId
    });

  } catch (err) {
    console.error(err);
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Signup failed' });
  }
});

/* --------------------------------------------------
   VERIFY EMAIL OTP (2)
-------------------------------------------------- */

router.post('/verify-email-otp', async (req, res) => {
  try {
    const { email, roleHint, otp } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !roleHint || !otp)
      return res.status(400).json({ error: 'Email, role, and OTP required' });

    if (roleHint !== 'patient' && roleHint !== 'doctor')
      return res.status(400).json({ error: 'Invalid role' });

    const user = roleHint === 'patient'
      ? await Patient.findOne({ 'credentials.email': normalizedEmail })
      : await Doctor.findOne({ 'credentials.email': normalizedEmail });

    if (!user)
      return res.status(404).json({ error: 'User not found' });

    if (user.credentials.emailVerified)
      return res.status(409).json({ error: 'Email already verified' });

    const otpRecord = await EmailOtp.findOne({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'signup',
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord)
      return res.status(401).json({ error: 'OTP expired or invalid' });

    const otpHash = hashOtp(otp);
    if (otpHash !== otpRecord.otpHash)
      return res.status(401).json({ error: 'OTP expired or invalid' });

    user.credentials.emailVerified = true;
    await user.save();

    await EmailOtp.deleteMany({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'signup'
    });

    const jwtPayload = {
      sub: user._id.toString(),
      role: roleHint
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.json({
      refreshToken,
      accessToken,
      role: roleHint,
      userId: user._id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
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
    if (roleHint === 'patient') {
      const payload = ticket.getPayload();
      const { name, email, sub, picture } = payload;

      user = await Patient.findOne({ 'credentials.email': email });

      if (!user) {
        user = await Patient.create({
          name,
          image: picture,
          location: null,
          phone: null,
          age: null,
          gender: null,
          credentials: {
            email,
            password: sub,
            provider: 'google',
            emailVerified: true
          }
        });
      }
    }

    if (!user)
      return res.status(400).json({ error: 'Unsupported role for Google sign-in' });

    const jwtPayload = {
      sub: user._id.toString(),
      role: roleHint
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.json({
      refreshToken,
      accessToken,
      role: roleHint,
      userId: user._id
    });

    console.log('Success');

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
      : null);

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

/* --------------------------------------------------
   FORGOT PASSWORD (SEND OTP)
-------------------------------------------------- */

router.post('/forgot-password', async (req, res) => {
  try {
    const { email, roleHint } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !roleHint)
      return res.status(400).json({ error: 'Email and role required' });

    if (roleHint !== 'patient' && roleHint !== 'doctor')
      return res.status(400).json({ error: 'Invalid role' });

    if (!smtpConfigured)
      return res.status(500).json({ error: 'Email service not configured' });

    const user = roleHint === 'patient'
      ? await Patient.findOne({ 'credentials.email': normalizedEmail })
      : await Doctor.findOne({ 'credentials.email': normalizedEmail });

    if (!user)
      return res.json({ message: 'If an account exists, a reset code was sent' });

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await EmailOtp.deleteMany({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'password_reset'
    });

    await EmailOtp.create({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'password_reset',
      otpHash,
      expiresAt
    });

    await sendEmail({
      to: normalizedEmail,
      subject: 'Your SwiftCare password reset code',
      text: `Your password reset code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      html: buildPasswordResetEmailHtml({
        name: user.name,
        otp,
        minutes: OTP_TTL_MINUTES
      })
    });

    res.json({ message: 'If an account exists, a reset code was sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

/* --------------------------------------------------
   RESET PASSWORD (VERIFY OTP)
-------------------------------------------------- */

router.post('/reset-password', async (req, res) => {
  try {
    const { email, roleHint, otp, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !roleHint || !otp || !newPassword)
      return res.status(400).json({ error: 'Email, role, OTP, and new password required' });

    if (roleHint !== 'patient' && roleHint !== 'doctor')
      return res.status(400).json({ error: 'Invalid role' });

    const user = roleHint === 'patient'
      ? await Patient.findOne({ 'credentials.email': normalizedEmail })
      : await Doctor.findOne({ 'credentials.email': normalizedEmail });

    if (!user)
      return res.status(404).json({ error: 'User not found' });

    const otpRecord = await EmailOtp.findOne({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'password_reset',
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord)
      return res.status(401).json({ error: 'OTP expired or invalid' });

    const otpHash = hashOtp(otp);
    if (otpHash !== otpRecord.otpHash)
      return res.status(401).json({ error: 'OTP expired or invalid' });

    const saltRounds = 12;
    user.credentials.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    await EmailOtp.deleteMany({
      userId: user._id,
      email: normalizedEmail,
      role: roleHint,
      purpose: 'password_reset'
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
