const express = require("express");
const router = express.Router();
const { askGemini } = require("../services/gemini.service");
const Doctor = require("../models/doctor");

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    // 1) Fetch doctors
    const doctors = await Doctor.find().lean();

    // 2) Convert doctors into readable context
    const doctorsContext = doctors.map(d => {
      return `
Doctor Name: ${d.name}
Specialty: ${d.specialization}
Timings: ${d.availableHours || "Not available"}
Available days: ${(d.availableDays || []).join(", ")}
`;
    }).join("\n");

    // 3) System Prompt
    const systemPrompt = `You are Swiftcare's virtual healthcare assistant.

Answer ONLY questions related to:
- Appointments & bookings
- Payments
- Doctor timings
- Basic medical services

Rules:

BOOKING:
Patients must:
1) Select a doctor based on their problem
2) Choose an available time slot
3) Complete payment
Live Queue Tracking is available to view position and waiting time.

PAYMENT:
Only card payments are accepted. All payments are secure.

TIMINGS:
Use ONLY the doctor data provided below.
If doctor or timing is not found, say you do not have that information.

DOCTOR DATA:
{{DOCTORS_CONTEXT}}

SERVICES:
- Answer basic medicine questions (use, ingredients, mild symptom relief)
- Do NOT diagnose diseases
- Do NOT suggest strong/restricted drugs
- Advise doctor consultation for serious or persistent symptoms

STYLE:
Be polite, concise, and accurate.
Never invent information.

`.replace("{{DOCTORS_CONTEXT}}", doctorsContext);

    // 4) Final prompt
    const finalPrompt = `
${systemPrompt}

User Question:
${message}
`;

    const reply = await askGemini(finalPrompt);

    res.json({ reply });

  } catch (err) {
    console.error("GEMINI ERROR:", err);
    res.status(500).json({
      error: err.message || "Gemini failed",
    });
  }
});

module.exports = router;