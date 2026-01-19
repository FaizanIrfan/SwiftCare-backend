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

    day: {
      type: String
    },

    date: {
      type: String   // "19 Mar"
    },

    time: {
      type: String
    },

    bookingFor: {
      type: String
    },

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

    status: {
      type: String,
      default: 'Pending'
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

module.exports = mongoose.model('Appointment', appointmentSchema, 'appointments');
