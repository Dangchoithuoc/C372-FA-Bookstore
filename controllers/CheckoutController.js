const Cart = require("../models/Cart");
const Order = require("../models/Order");

// Basic checkout simulation (uses DB-backed cart)
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

    processPayment: async (req, res) => {
        try {
            const userId = req.session.user.id;
            // Future: connect to real payment API
            const orderId = await Order.checkout(userId, "Manual");
            if (!orderId) {
                return res.status(500).send("Order could not be created");
            }
            res.redirect(`/invoice/${orderId}`);
        } catch (err) {
            console.error("Payment error", err);
            res.status(500).send("Payment failed");
        }
    }
};
