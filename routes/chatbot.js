const express = require("express");
const router = express.Router();
const { askGemini } = require("../services/gemini.service");

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const reply = await askGemini(message);
    res.json({ reply });

  } catch (err) {
    console.error("GEMINI ERROR:", err);
    res.status(500).json({
      error: err.message || "Gemini failed",
    });
  }
});


module.exports = router;