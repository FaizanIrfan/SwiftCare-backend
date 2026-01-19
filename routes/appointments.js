const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment');

// Create Appointment
router.post('/', async (req, res) => {
  try {
    const a = new Appointment(req.body);
    const saved = await a.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Appointments
router.get('/', async (req, res) => {
  const list = await Appointment.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});

module.exports = router;