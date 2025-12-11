// CART CONTROLLER (Simple Version Using Session Only)

module.exports = {

    // Show all items in cart
    showCart: (req, res) => {
        const cart = req.session.cart || [];
        res.render("cart", { cart });
    },

    // Add item to cart
    addToCart: (req, res) => {
        const { id, title, price } = req.body;    // from form input
        const qty = Number(req.body.qty || 1);

        if (!req.session.cart) req.session.cart = [];

        // Check if item already in cart
        let item = req.session.cart.find(i => i.id === id);

        if (item) {
            // If exists → increase quantity
            item.qty += qty;
        } else {
            // If not exists → push new item
            req.session.cart.push({
                id,
                title,
                price: Number(price),
                qty
            });
        }

        res.redirect("/cart");
    },

    // Update quantity
    updateQty: (req, res) => {
        const { id } = req.params;
        const qty = Number(req.body.qty);

        const cart = req.session.cart || [];

        let item = cart.find(i => i.id === id);
        if (!item) return res.redirect("/cart");

        // If qty = 0 → remove item
        if (qty <= 0) {
            req.session.cart = cart.filter(i => i.id !== id);
        } else {
            item.qty = qty;
        }

        res.redirect("/cart");
    },

    // Remove an item completely
    removeItem: (req, res) => {
        const { id } = req.params;

        const cart = req.session.cart || [];
        req.session.cart = cart.filter(i => i.id !== id);

        res.redirect("/cart");
    },

    // Empty entire cart
    clearCart: (req, res) => {
        req.session.cart = [];
        res.redirect("/cart");
    },

    // Checkout page showing total
    checkoutPage: (req, res) => {
        const cart = req.session.cart || [];
        let total = 0;

        cart.forEach(item => {
            total += item.price * item.qty;
        });

        res.render("checkout", { 
            cart,
            total: total.toFixed(2) 
        });
    },

    // Payment simulation
    processPayment: (req, res) => {
        req.session.cart = []; // clear after payment
        res.send("Payment processed successfully! (Simulated)");
    }

};
