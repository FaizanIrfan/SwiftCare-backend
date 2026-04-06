const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { createPaymentIntent, getPaymentIntent } = require("../services/paymentService");
const Appointment = require("../models/appointment");
const { requireAuth } = require("../auth/auth.middleware");
const { createNotification } = require("../services/notification.service");

function parseValidAmount(rawAmount) {
  const parsed = Number(rawAmount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeCurrency(rawCurrency) {
  const normalized = String(rawCurrency || "pkr").trim().toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : null;
}

const CURRENCY_DECIMALS = {
  jpy: 0,
  krw: 0,
  bhd: 3,
  kwd: 3,
  omr: 3
};

function getCurrencyDecimals(currency) {
  const normalized = normalizeCurrency(currency);
  if (!normalized) return null;
  return CURRENCY_DECIMALS[normalized] ?? 2;
}

router.post("/create-intent", async (req, res) => {
  try {
    const { amount, appointmentId } = req.body;
    const parsedAmount = parseValidAmount(amount);

    if (parsedAmount === null) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const paymentIntent = await createPaymentIntent(parsedAmount, {
      appointmentId: appointmentId ? String(appointmentId) : undefined
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/confirm", requireAuth, async (req, res) => {
  try {
    const {
      appointmentId,
      amount,
      currency = "pkr",
      paymentIntentId,
      status = "succeeded"
    } = req.body;
    const parsedAmount = parseValidAmount(amount);
    const normalizedCurrency = normalizeCurrency(currency);
    const currencyDecimals = getCurrencyDecimals(normalizedCurrency);

    const actorUserId = String(req.user?.sub || "");
    const actorRole = req.user?.role;

    if (!appointmentId || parsedAmount === null || !paymentIntentId || !normalizedCurrency || currencyDecimals === null) {
      return res.status(400).json({
        error: "appointmentId, valid amount, paymentIntentId, and valid currency are required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(String(appointmentId))) {
      return res.status(400).json({ error: "Invalid appointmentId" });
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const isOwner =
      actorRole === "admin" ||
      actorUserId === String(appointment.patientId) ||
      actorUserId === String(appointment.doctorId);

    if (!isOwner) {
      return res.status(403).json({ error: "Forbidden for this appointment" });
    }

    const hasStoredAmount = appointment.amount !== null && appointment.amount !== undefined;
    const storedAmount = hasStoredAmount ? Number(appointment.amount) : null;
    if (hasStoredAmount && (!Number.isFinite(storedAmount) || storedAmount <= 0)) {
      return res.status(400).json({ error: "Invalid expected appointment amount" });
    }
    if (hasStoredAmount && storedAmount !== parsedAmount) {
      return res.status(400).json({ error: "Amount does not match appointment amount" });
    }
    const expectedAmount = hasStoredAmount ? storedAmount : parsedAmount;

    const expectedCurrency = normalizeCurrency(appointment.currency || normalizedCurrency);
    if (!expectedCurrency) {
      return res.status(400).json({ error: "Invalid expected appointment currency" });
    }
    const expectedDecimals = getCurrencyDecimals(expectedCurrency);
    const paymentIntent = await getPaymentIntent(String(paymentIntentId));
    const expectedAmountInMinor = Math.round(expectedAmount * (10 ** expectedDecimals));
    const isPaid = paymentIntent?.status === "succeeded";
    const amountMatches = Number(paymentIntent?.amount) === expectedAmountInMinor;
    const currencyMatches = String(paymentIntent?.currency || "").toLowerCase() === expectedCurrency;

    if (!isPaid || !amountMatches || !currencyMatches) {
      console.error("Payment mismatch detected", {
        appointmentId: String(appointment._id),
        paymentIntentId: String(paymentIntentId),
        stripeStatus: paymentIntent?.status,
        stripeAmount: paymentIntent?.amount,
        expectedAmountInMinor,
        stripeCurrency: paymentIntent?.currency,
        expectedCurrency
      });
      return res.status(400).json({
        error: "Payment verification failed"
      });
    }

    appointment.amount = expectedAmount;
    if (appointment.currency == null) {
      appointment.currency = expectedCurrency;
    }
    await appointment.save();

    const scheduleLabel = `${appointment.date || "upcoming date"} at ${appointment.time || "scheduled time"}`;
    const normalizedAmountValue = expectedAmount.toFixed(2);

    try {
      await createNotification({
        userId: appointment.patientId,
        role: "patient",
        type: "payment_success",
        title: "Payment Successful",
        body: `Your payment of ${normalizedAmountValue} ${normalizedCurrency.toUpperCase()} for ${scheduleLabel} was successful.`,
        data: {
          appointmentId: String(appointment._id),
          paymentIntentId: String(paymentIntentId),
          amount: expectedAmount,
          currency: expectedCurrency,
          status
        }
      });
    } catch (notificationError) {
      if (notificationError?.code !== 11000) throw notificationError;
    }

    try {
      await createNotification({
        userId: appointment.doctorId,
        role: "doctor",
        type: "payment_success",
        title: "Patient Payment Received",
        body: `Payment of ${normalizedAmountValue} ${normalizedCurrency.toUpperCase()} received for appointment on ${scheduleLabel}.`,
        data: {
          appointmentId: String(appointment._id),
          paymentIntentId: String(paymentIntentId),
          amount: expectedAmount,
          currency: expectedCurrency,
          status
        }
      });
    } catch (notificationError) {
      if (notificationError?.code !== 11000) throw notificationError;
    }

    return res.json({
      message: "Payment confirmed and notifications sent"
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(200).json({ message: "Payment already confirmed" });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
