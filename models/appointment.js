const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true
    },

    doctorId: {
      type: String,
      required: true
    },

    doctorName: {
      type: String
    },

    shiftId: {                   // <--- Added for queue tracking
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: true
    },

    queueNumber: {                   // <--- Added for live queue
      type: Number,
      default: 0
    },

    day: {
      type: String
    },

    date: {
      type: String
    },

    time: {
      type: String
    },

    bookingFor: {
      type: String
    }, // 1. Self   2. SomeoneElse

    gender: {
      type: String
    },

    age: {
      type: String
    },

    problem: {
      type: String
    },

    amount: {
      type: Number
    },

    currency: {
      type: String
    },

    consultationNotes: {
      type: String,
      default: ''
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending'
    },

    fullDateIso: {
      type: String
    },

    timestamp: {
      type: String
    }
  },
  { timestamps: true }
);

appointmentSchema.index(
  { doctorId: 1, date: 1, shiftId: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'cancelled' } }
  }
);

module.exports = mongoose.model('Appointment', appointmentSchema, 'appointments');
