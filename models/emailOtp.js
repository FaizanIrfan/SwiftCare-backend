const mongoose = require('mongoose');

const emailOtpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format']
    },
    role: {
      type: String,
      required: true,
      enum: ['patient', 'doctor']
    },
    purpose: {
      type: String,
      required: true,
      enum: ['signup', 'password_reset']
    },
    otpHash: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOtpSchema.index({ userId: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('EmailOtp', emailOtpSchema, 'email_otps');
