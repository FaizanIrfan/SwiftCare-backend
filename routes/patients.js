const express = require('express');
const router = express.Router();
const Patient = require('../models/patient');

// Create Patient
router.post('/', async (req, res) => {
  try {
    const p = new Patient(req.body);
    const saved = await p.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Patients
router.get('/', async (req, res) => {
  const list = await Patient.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});

// Read single Patient
router.get('/:id', async (req, res) => {
  const p = await Patient.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Patient not found" });
  res.json(p);
});

// Update Patient
router.put('/:id', async (req, res) => {
  try {
    const updated = await Patient.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Patient
router.delete('/:id', async (req, res) => {
  await Patient.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;