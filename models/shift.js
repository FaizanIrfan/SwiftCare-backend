const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true
    },
    date: {
      type: String,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'ended'],
      default: 'scheduled',
      index: true
    }
  },
  { timestamps: true }
);

shiftSchema.index({ doctorId: 1, date: 1, startTime: 1, endTime: 1 }, { unique: true });
shiftSchema.index(
  { doctorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' }
  }
);

module.exports = mongoose.model('Shift', shiftSchema, 'shifts');
