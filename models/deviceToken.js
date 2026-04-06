const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin']
    },
    token: {
      type: String,
      required: true,
      trim: true
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

deviceTokenSchema.index({ userId: 1, platform: 1 });
deviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema, 'deviceTokens');
