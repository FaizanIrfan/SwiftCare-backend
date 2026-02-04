const express = require('express');
const router = express.Router();
const Doctor = require('../models/doctor');

/* --------------------------------------------------
   Create doctor
-------------------------------------------------- */

router.post('/', async (req, res) => {
  try {
    const d = new Doctor(req.body);
    const saved = await d.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* --------------------------------------------------
   Read all doctors
-------------------------------------------------- */

router.get('/', async (req, res) => {
  const doctors = await Doctor.find().sort({ createdAt: -1 }).lean();
  res.json(doctors);
});

/* --------------------------------------------------
   Nearby doctor
-------------------------------------------------- */

router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat & lng are required" });

    const maxDistance = radius ? parseInt(radius) : 5000; // meters

    const doctors = await Doctor.find({
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: maxDistance,
        },
      },
    });

    // Flexible response for any frontend
    res.json(doctors.map(d => ({
      id: d._id,
      name: d.name,
      specialty: d.specialty,
      contact: d.contact,
      lat: d.location.coordinates[1],
      lng: d.location.coordinates[0],
      clinicAddress: d.clinicAddress,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* --------------------------------------------------
   Read single doctor
-------------------------------------------------- */

router.get('/:id', async (req, res) => {
  const d = await Doctor.findById(req.params.id);
  if (!d) return res.status(404).json({ error: "Doctor not found" });
  res.json(d);
});

/* --------------------------------------------------
   Update doctor
-------------------------------------------------- */

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

module.exports = router;