const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    image: {
      type: String
    },

    specialization: {
      type: String,
      required: true
    },

    location: {
      type: { type: String, default: "Point" },
      coordinates: [Number] // [longitude, latitude]
    },

    contactNo: {
      type: String
    },

    experience: {
      type: String   // "8+" → keep as String
    },

    about: {
      type: String
    },

    consulationFee: {
      type: Number
    },

    patients: {
      type: String   // "1200+" → String
    },

    verified: {
      type: Boolean,
      default: false
    },

    availableDays: {
      type: [String],
      default: []
    },

    availableHours: {
      type: [String],
      default: []
    },

    education: {
      type: [String],
      default: []
    },

    documents: {
      type: [String],
      default: []
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

doctorSchema.pre('save', async function (next) {
  if (!this.isModified('credentials.password')) return next();
  this.credentials.password = await bcrypt.hash(this.credentials.password, 12);
  next();
});

DoctorSchema.index({ location: "2dsphere" }); // Enable geospatial queries

module.exports = mongoose.model('Doctor', doctorSchema, 'doctors');