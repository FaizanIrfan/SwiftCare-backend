const express = require("express");
const router = express.Router();
const { createPaymentIntent } = require("../services/paymentService");

router.post("/create-intent", async (req, res) => {
  try {
    const { amount } = req.body;

    const paymentIntent = await createPaymentIntent(amount);

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;