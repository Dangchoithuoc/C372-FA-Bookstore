const CartModel = require("../models/Cart");

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

async function requireCartItems(req, res, next) {
    try {
        const userId = req.session.user && req.session.user.id;
        if (!userId) return res.redirect("/login");
        const { items } = await CartModel.getCart(userId);
        if (!items || !items.length) {
            return res.redirect("/cart");
        }
        next();
    } catch (err) {
        console.error("Cart check error", err);
        res.redirect("/cart");
    }
}

module.exports = { requireLogin, requireCartItems };
