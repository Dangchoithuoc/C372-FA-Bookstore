const CartModel = require("../models/Cart");

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function requireBuyer(req, res, next) {
    const user = req.session.user;
    if (!user) {
        return res.redirect("/login");
    }
    if (user.role !== "buyer") {
        return res.status(403).send("Access denied.");
    }
    next();
}

function requireSeller(req, res, next) {
    const user = req.session.user;
    if (!user) {
        return res.redirect("/login");
    }
    if (user.role !== "seller" && user.role !== "admin") {
        return res.status(403).send("Access denied.");
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

module.exports = { requireLogin, requireBuyer, requireSeller, requireCartItems };
