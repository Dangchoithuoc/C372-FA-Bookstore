const Cart = require("../models/Cart");
const Order = require("../models/Order");

function isEmail(s = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

module.exports = {
  checkoutPage: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { items, total } = await Cart.getCart(userId);

      res.render("checkout", {
        cart: items,
        total: total.toFixed(2),
        user: req.session.user,
        checkout: req.session.checkoutDetails || null
      });
    } catch (err) {
      console.error("Checkout load error", err);
      res.status(500).send("Failed to load checkout");
    }
  },

  // Save delivery + contact before payment (AJAX)
  saveCheckoutDetails: async (req, res) => {
    try {
      const body = req.body || {};

      const deliveryType = (body.delivery_type || "").trim();
      const firstName = (body.first_name || "").trim();
      const lastName = (body.last_name || "").trim();
      const email = (body.email || "").trim();
      const contact = (body.contact || "").trim();

      if (!firstName || !lastName || !email || !contact) {
        return res.status(400).json({ error: "Please fill in contact information." });
      }
      if (!isEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email." });
      }

      if (deliveryType !== "SHIP" && deliveryType !== "PICKUP") {
        return res.status(400).json({ error: "Please choose Ship or Pick up." });
      }

      const details = {
        delivery_type: deliveryType,
        first_name: firstName,
        last_name: lastName,
        email,
        contact
      };

      if (deliveryType === "SHIP") {
        const a1 = (body.ship_address1 || "").trim();
        const city = (body.ship_city || "").trim();
        const postal = (body.ship_postal || "").trim();

        if (!a1 || !city || !postal) {
          return res.status(400).json({ error: "Please fill Shipping Address Line 1, City, and Postal Code." });
        }
        details.ship_address1 = a1;
        details.ship_address2 = (body.ship_address2 || "").trim();
        details.ship_city = city;
        details.ship_postal = postal;
      }

      if (deliveryType === "PICKUP") {
        const loc = (body.pickup_location || "").trim();
        const slot = (body.pickup_timeslot || "").trim();

        if (!loc || !slot) {
          return res.status(400).json({ error: "Please select pickup location and time slot." });
        }
        details.pickup_location = loc;
        details.pickup_timeslot = slot;
      }

      req.session.checkoutDetails = details;
      return res.json({ ok: true });
    } catch (err) {
      console.error("Save checkout details error", err);
      res.status(500).json({ error: "Failed to save checkout details." });
    }
  },

  // If you still use /checkout/pay somewhere
  processPayment: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const orderId = await Order.checkout(userId, "Manual");
      if (!orderId) return res.status(500).send("Order could not be created");
      res.redirect(`/invoice/${orderId}`);
    } catch (err) {
      console.error("Payment error", err);
      res.status(500).send("Payment failed");
    }
  },

  // Skip payment (testing)
  skipPayment: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const orderId = await Order.checkout(userId, "Test");
      if (!orderId) return res.status(500).send("Order could not be created");
      res.redirect(`/invoice/${orderId}`);
    } catch (err) {
      console.error("Skip payment error", err);
      res.status(500).send("Payment failed");
    }
  },

  // Placeholder (you can implement later)
  payLah: async (req, res) => {
    res.status(501).send("PayLah not implemented yet");
  }
};
