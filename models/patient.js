const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    location: {
      type: { type: String, default: "Point" },
      coordinates: [Number] // [longitude, latitude]
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

    avatar: {
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
      },
      provider: {
        type: String,
        required: true
      }
    }
  },
  { timestamps: true }
);

patientSchema.pre('save', async function (next) {
  if (!this.isModified('credentials.password')) return next();
  this.credentials.password = await bcrypt.hash(this.credentials.password, 12);
  next();
});

module.exports = mongoose.model('Patient', patientSchema, 'patients');