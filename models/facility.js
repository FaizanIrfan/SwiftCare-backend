const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    about: {
      type: String,
      trim: true
    },
    location: {
      label: {
        type: String,
        trim: true
      },
      geo: {
        type: {
          type: String,
          default: "Point"
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
        }
      }
    },
    doctorList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
      }
    ]
  },
  { timestamps: true }
);

// Indexes to support geolocation queries (like doctor's nearSphere queries)
facilitySchema.index({ 'location.geo': "2dsphere" });
facilitySchema.index({ 'location.coordinates': "2dsphere" });

module.exports = mongoose.model('Facility', facilitySchema, 'facilities');
