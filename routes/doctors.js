const express = require('express');
const router = express.Router();
const Doctor = require('../models/doctor');

// Create Doctor
router.post('/', async (req, res) => {
  try {
    const d = new Doctor(req.body);
    const saved = await d.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Doctors
router.get('/', async (req, res) => {
  const doctors = await Doctor.find().sort({ createdAt: -1 }).lean();
  res.json(doctors);
});

// Read single Doctor
router.get('/:id', async (req, res) => {
  const d = await Doctor.findById(req.params.id);
  if (!d) return res.status(404).json({ error: "Doctor not found" });
  res.json(d);
});

// Update Doctor
router.put('/:id', async (req, res) => {
  try {
    const updated = await Doctor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Doctor
router.delete('/:id', async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;