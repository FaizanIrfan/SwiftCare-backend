require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const Patient = require('./models/patient');
const Doctor = require('./models/doctor');
const Review = require('./models/review');
const Appointment = require('./models/appointment');

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------
// 1️⃣ Connect to MongoDB SwiftCare
// -------------------------------
mongoose.connect(process.env.MONGO_URI, {
  dbName: "SwiftCare"
})
.then(() => console.log("MongoDB Connected to SwiftCare DB"))
.catch(err => console.error("MongoDB connection error:", err));

// -------------------------------
// 2️⃣ PATIENT CRUD
// -------------------------------

// Create Patient
app.post('/patients', async (req, res) => {
  try {
    const p = new Patient(req.body);
    const saved = await p.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Patients
app.get('/patients', async (req, res) => {
  const list = await Patient.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});



// -------------------------------
// 3️⃣ DOCTOR CRUD
// -------------------------------

// Create Doctor
app.post('/doctors', async (req, res) => {
  try {
    const d = new Doctor(req.body);
    const saved = await d.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Doctors and send
app.get('/doctors', async (req, res) => {
  const doctors = await Doctor.find().sort({ createdAt: -1 }).lean();
  res.json(doctors);
});



// -------------------------------
// 3️⃣ REVIEW CRUD
// -------------------------------

// Create Review
app.post('/reviews', async (req, res) => {
  try {
    const d = new Review(req.body);
    const saved = await d.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Review
app.get('/reviews', async (req, res) => {
  const list = await Review.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});



// -------------------------------
// 3️⃣ APPOINTMENT CRUD
// -------------------------------

// Create Appointment
app.post('/appointments', async (req, res) => {
  try {
    const d = new Appointment(req.body);
    const saved = await d.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Appointments
app.get('/appointments', async (req, res) => {
  const list = await Appointment.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});



// -------------------------------
// Start Server
// -------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));














/* -------------------------------
// Not needed right now
// -------------------------------

// Read single Doctor
app.get('/doctors/:id', async (req, res) => {
  const d = await Doctor.findById(req.params.id);
  if (!d) return res.status(404).json({ error: "Doctor not found" });
  res.json(d);
});

// Update Doctor
app.put('/doctors/:id', async (req, res) => {
  try {
    const updated = await Doctor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Doctor
app.delete('/doctors/:id', async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});



// Read single Review
app.get('/reviews/:id', async (req, res) => {
  const d = await Review.findById(req.params.id);
  if (!d) return res.status(404).json({ error: "Review not found" });
  res.json(d);
});

// Update Review
app.put('/reviews/:id', async (req, res) => {
  try {
    const updated = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Review
app.delete('/reviews/:id', async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});



// Read single Patient
app.get('/patients/:id', async (req, res) => {
  const p = await Patient.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Patient not found" });
  res.json(p);
});

// Update Patient
app.put('/patients/:id', async (req, res) => {
  try {
    const updated = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Patient
app.delete('/patients/:id', async (req, res) => {
  await Patient.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

*/