const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true
    },

    patientId: {
      type: String,
      required: true
    },

    rating: {
      type: Number,
      min: 0,
      max: 5
    },

    review: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema, 'reviews');