// Basic checkout simulation (no database yet)

module.exports = {

    checkoutPage: (req, res) => {
        const cart = req.session.cart || [];
        let total = 0;

        cart.forEach(item => {
            total += item.price * item.qty;
        });

        // Send BOTH cart and total to the view
        res.render("checkout", { 
            cart: cart,
            total: total.toFixed(2)
        });
    },

    processPayment: (req, res) => {
        // Future: connect to real payment API
        req.session.cart = []; // clear cart after simulation
        res.send("Payment processed successfully! (Simulated)");
    }
};
