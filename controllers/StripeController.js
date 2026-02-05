const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Wallet = require("../models/Wallet");
const Membership = require("../models/Membership");
const stripeService = require("../services/stripe");

function buildLineItems(items) {
  return items.map(item => ({
    price_data: {
      currency: "SGD",
      product_data: {
        name: item.title
      },
      unit_amount: Math.round(Number(item.price) * 100)
    },
    quantity: Number(item.qty)
  }));
}

module.exports = {
  checkoutSession: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const cart = await Cart.getCart(userId);
      if (!cart.items.length) {
        return res.redirect("/cart");
      }

      const applyMembership = req.session.checkoutDetails?.apply_membership !== false;
      const totals = await Membership.computeTotals(userId, cart.total, applyMembership);

      const origin = `${req.protocol}://${req.get("host")}`;
      const coupon = await stripeService.createDiscountCoupon(totals.discountPercent);
      const session = await stripeService.createCheckoutSession({
        lineItems: buildLineItems(cart.items),
        successUrl: `${origin}/checkout/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/checkout?cancelled=1`,
        discounts: coupon ? [{ coupon: coupon.id }] : undefined,
        metadata: {
          user_id: String(userId),
          discount_percent: String(totals.discountPercent || 0)
        }
      });

      return res.redirect(303, session.url);
    } catch (err) {
      console.error("Stripe checkout session error:", err);
      res.redirect("/checkout");
    }
  },

  checkoutSuccess: async (req, res) => {
    try {
      const sessionId = req.query.session_id;
      if (!sessionId) return res.redirect("/checkout");

      const session = await stripeService.retrieveSession(sessionId);
      if (session.payment_status !== "paid") {
        return res.redirect("/checkout");
      }

      if (!req.session.stripeOrderCompleted) {
        const userId = req.session.user.id;
        const cart = await Cart.getCart(userId);
        if (!cart.items.length) {
          return res.redirect("/orders");
        }
        const applyMembership = req.session.checkoutDetails?.apply_membership !== false;
        const totals = await Membership.computeTotals(userId, cart.total, applyMembership);

        const orderId = await Order.checkout(userId, "Stripe", null, {
          providerTxnId: session.payment_intent
        }, {
          discountPercent: totals.discountPercent,
          discountAmount: totals.discountAmount,
          total: totals.total
        });
        req.session.stripeOrderCompleted = { orderId };
      }

      const orderId = req.session.stripeOrderCompleted?.orderId;
      if (orderId) {
        return res.redirect(`/invoice/${orderId}`);
      }
      return res.redirect("/orders");
    } catch (err) {
      console.error("Stripe checkout success error:", err);
      res.redirect("/checkout");
    }
  },

  walletSession: async (req, res) => {
    try {
      const amount = Number(req.body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.redirect("/wallet");
      }
      const userId = req.session.user.id;
      const origin = `${req.protocol}://${req.get("host")}`;

      const session = await stripeService.createCheckoutSession({
        lineItems: [{
          price_data: {
            currency: "SGD",
            product_data: { name: "Wallet Top Up" },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        successUrl: `${origin}/wallet/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/wallet`,
        metadata: {
          user_id: String(userId),
          topup_amount: String(amount.toFixed(2))
        }
      });

      return res.redirect(303, session.url);
    } catch (err) {
      console.error("Stripe wallet session error:", err);
      res.redirect("/wallet");
    }
  },

  walletSuccess: async (req, res) => {
    try {
      const sessionId = req.query.session_id;
      if (!sessionId) return res.redirect("/wallet");
      const session = await stripeService.retrieveSession(sessionId);
      if (session.payment_status !== "paid") {
        return res.redirect("/wallet");
      }
      const amount = Number(session.metadata?.topup_amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.redirect("/wallet");
      }
      await Wallet.credit(req.session.user.id, amount, "topup_stripe");
      return res.redirect("/wallet");
    } catch (err) {
      console.error("Stripe wallet success error:", err);
      res.redirect("/wallet");
    }
  }
};
