const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16"
});

async function createDiscountCoupon(percent) {
  if (!percent || percent <= 0) return null;
  return stripe.coupons.create({
    percent_off: Number(percent),
    duration: "once"
  });
}

async function createCheckoutSession({ lineItems, successUrl, cancelUrl, discounts, metadata }) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    discounts: discounts || undefined,
    payment_intent_data: {
      metadata: metadata || {}
    },
    metadata: metadata || {}
  });
}

async function retrieveSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId);
}

async function refundPaymentIntent(paymentIntentId, amount) {
  if (!paymentIntentId) throw new Error("Missing Stripe payment intent id.");
  const params = { payment_intent: paymentIntentId };
  if (Number.isFinite(Number(amount))) {
    params.amount = Math.round(Number(amount) * 100);
  }
  return stripe.refunds.create(params);
}

module.exports = {
  stripe,
  createCheckoutSession,
  retrieveSession,
  createDiscountCoupon,
  refundPaymentIntent
};
