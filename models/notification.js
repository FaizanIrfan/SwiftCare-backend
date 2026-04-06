const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      default: null
    },
    type: {
      type: String,
      required: true,
      default: 'system'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    body: {
      type: String,
      required: true,
      trim: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { type: 1, 'data.paymentIntentId': 1, 'data.appointmentId': 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'payment_success' }
  }
);

module.exports = mongoose.model('Notification', notificationSchema, 'notifications');
