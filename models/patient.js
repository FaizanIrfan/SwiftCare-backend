const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    location: {
      type: String
    },

    phone: {
      type: String
    },

    age: {
      type: String   // keep string to match DB
    },

    gender: {
      type: String
    },

    credentials: {
      email: {
        type: String,
        required: true,
        lowercase: true
      },
      password: {
        type: String,
        required: true
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema, 'patients');