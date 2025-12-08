const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  doctorName: String,
  day: String,
  date: String,
  time: String,
  bookingFor: String,
  gender: String,
  age: String,
  problem: String,
}, { timestamps: true });

// ⚡ IMPORTANT: third argument = existing collection name
module.exports = mongoose.model("Appointment", appointmentSchema, "appointments");
