const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Patient = require('../models/patient');
const { requireAuth } = require('../auth/auth.middleware');

router.use(requireAuth);

/* --------------------------------------------------
   Read all patients
-------------------------------------------------- */
router.get('/', async (req, res) => {
  const list = await Patient.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});

/* --------------------------------------------------
   Update location
-------------------------------------------------- */
router.put('/location/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'admin' && String(req.user?.sub || '') !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { label, coordinates } = req.body;

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ error: 'coordinates must be [longitude, latitude]' });
    }

    const updated = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        location: {
          label,
          type: "Point",
          coordinates
        }
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Patient not found' });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* --------------------------------------------------
   Read single patient
-------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'admin' && String(req.user?.sub || '') !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const p = await Patient.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Patient not found" });
    return res.json(p);
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ error: 'Invalid patient id' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* --------------------------------------------------
   Update patient
-------------------------------------------------- */
router.put('/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'admin' && String(req.user?.sub || '') !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const allowedFields = ['name', 'phone', 'age', 'gender', 'image', 'avatar'];
    const sanitizedUpdate = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        sanitizedUpdate[field] = req.body[field];
      }
    });

    const updated = await Patient.findByIdAndUpdate(
      req.params.id,
      sanitizedUpdate,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Patient not found' });
    res.json(updated);
  } catch (e) {
    if (e instanceof mongoose.Error.CastError) {
      return res.status(400).json({ error: 'Invalid patient id' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* --------------------------------------------------
   Delete patient
-------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const deleted = await Patient.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ error: 'Invalid patient id' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
