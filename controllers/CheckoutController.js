const Cart = require("../models/Cart");

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
            await Cart.clearCart(userId);
            res.send("Payment processed successfully! (Simulated)");
        } catch (err) {
            console.error("Payment error", err);
            res.status(500).send("Payment failed");
        }
    }
};
