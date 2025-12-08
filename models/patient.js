const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  name: String,
  age: Number,
  disease: String,
  phone: String
}, { timestamps: true });

// ⚡ IMPORTANT: third argument = existing collection name
module.exports = mongoose.model("Patient", patientSchema, "patients");
