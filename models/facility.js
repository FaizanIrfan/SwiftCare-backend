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
          enum: ["Point"],
          default: "Point"
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          required: true,
          validate: {
            validator: function(v) {
              return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
            },
            message: 'Coordinates must be an array of two numbers'
          }
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

facilitySchema.index({ 'location.geo': "2dsphere" });

module.exports = mongoose.model('Facility', facilitySchema, 'facilities');
