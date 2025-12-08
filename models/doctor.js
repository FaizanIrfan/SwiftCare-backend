const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: String,
  specialization: String,
  experience: Number,
  phone: String
}, { timestamps: true });

module.exports = mongoose.model("Doctor", doctorSchema, "doctors");
