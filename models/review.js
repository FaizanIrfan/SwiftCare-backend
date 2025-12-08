const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  rating: String,
  message: String
}, { timestamps: true });

// ⚡ IMPORTANT: third argument = existing collection name
module.exports = mongoose.model("Review", patientSchema, "reviews");
