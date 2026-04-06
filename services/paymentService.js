const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.createPaymentIntent = async (amount, metadata = {}) => {
  const amountInMinor = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountInMinor) || amountInMinor <= 0) {
    throw new Error("Invalid payment amount");
  }

  return await stripe.paymentIntents.create({
    amount: amountInMinor,
    currency: "pkr",
    payment_method_types: ["card"],
    metadata
  });
};

exports.getPaymentIntent = async (paymentIntentId) => {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
};
