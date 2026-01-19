const express = require('express');
const router = express.Router();
const Review = require('../models/review');

// Create Review
router.post('/', async (req, res) => {
  try {
    const r = new Review(req.body);
    const saved = await r.save();
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Read all Reviews
router.get('/', async (req, res) => {
  const list = await Review.find().sort({ createdAt: -1 }).lean();
  res.json(list);
});

// Read single Review
router.get('/:id', async (req, res) => {
  const r = await Review.findById(req.params.id);
  if (!r) return res.status(404).json({ error: "Review not found" });
  res.json(r);
});

// Update Review
router.put('/:id', async (req, res) => {
  try {
    const updated = await Review.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete Review
router.delete('/:id', async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;