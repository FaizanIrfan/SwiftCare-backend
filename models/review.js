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

    comment: {
      type: String
    },
    review: {
      type: String
    },

    adminResponse: {
      type: String,
      default: ''
    },

    adminRespondedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

reviewSchema.pre('save', function (next) {
  if (!this.comment && this.review) {
    this.comment = this.review;
  } else if (this.comment && !this.review) {
    this.review = this.comment;
  }
  next();
});

module.exports = mongoose.model('Review', reviewSchema, 'reviews');
