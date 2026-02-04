const Cart = require("../models/Cart");
const Order = require("../models/Order");

function buildDeliveryFromBody(body) {
  const deliveryType = (body.delivery_type || "").toUpperCase();
  if (!["SHIP", "PICKUP"].includes(deliveryType)) {
    return { error: "Please choose Ship or Pick up." };
  }

  if (deliveryType === "SHIP") {
    const a1 = (body.ship_address1 || "").trim();
    const a2 = (body.ship_address2 || "").trim();
    const city = (body.ship_city || "").trim();
    const postal = (body.ship_postal || "").trim();

    if (!a1 || !city || !postal) {
      return { error: "Missing shipping address fields." };
    }

    return {
      delivery: {
        type: "SHIP",
        location: [a1, a2, city, postal].filter(Boolean).join(", "),
        scheduled_time: null
      }
    };
  }

  // PICKUP
  const loc = (body.pickup_location || "").trim();
  const slot = (body.pickup_timeslot || "").trim();
  if (!loc || !slot) {
    return { error: "Missing pickup location/time slot." };
  }

  return {
    delivery: {
      type: "PICKUP",
      location: loc,
      scheduled_time: slot
    }
  };
}

module.exports = {
  checkoutPage: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { items, total } = await Cart.getCart(userId);

      res.render("checkout", {
        cart: items,
        total: total.toFixed(2),
        user: req.session.user
      });
    } catch (err) {
      console.error("Checkout load error", err);
      res.status(500).send("Failed to load checkout");
    }
  },

  // PayLah
  payLah: async (req, res) => {
    try {
      const userId = req.session.user.id;

      const built = buildDeliveryFromBody(req.body);
      if (built.error) return res.status(400).send(built.error);

      const orderId = await Order.checkout(userId, "PayLah", built.delivery);
      return res.redirect(`/invoice/${orderId}`);
    } catch (err) {
      console.error("PayLah error", err);
      res.status(500).send("Payment failed");
    }
  },

  // PayPal
  paypal: async (req, res) => {
    try {
      const userId = req.session.user.id;

      const built = buildDeliveryFromBody(req.body);
      if (built.error) return res.status(400).send(built.error);

      const orderId = await Order.checkout(userId, "PayPal", built.delivery);
      return res.redirect(`/invoice/${orderId}`);
    } catch (err) {
      console.error("PayPal error", err);
      res.status(500).send("Payment failed");
    }
  },

  // NETS
  nets: async (req, res) => {
    try {
      const userId = req.session.user.id;

      const built = buildDeliveryFromBody(req.body);
      if (built.error) return res.status(400).send(built.error);

      const orderId = await Order.checkout(userId, "NETS_QR", built.delivery);
      return res.redirect(`/invoice/${orderId}`);
    } catch (err) {
      console.error("NETS error", err);
      res.status(500).send("Payment failed");
    }
  }
};
