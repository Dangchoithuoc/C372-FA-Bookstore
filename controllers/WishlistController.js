const Wishlist = require("../models/Wishlist");

module.exports = {
    async viewWishlist(req, res) {
        try {
            const items = await Wishlist.getWishlist(req.session.user.id);
            res.render("wishlist", {
                user: req.session.user,
                items
            });
        } catch (err) {
            console.error("Wishlist view error:", err);
            res.status(500).send("Could not load wishlist");
        }
    },

    async addItem(req, res) {
        try {
            const bookId = Number(req.body.bookId);
            if (!bookId) return res.redirect("/");
            await Wishlist.addItem(req.session.user.id, bookId);
            res.redirect(req.get("referer") || "/wishlist");
        } catch (err) {
            console.error("Wishlist add error:", err);
            res.status(500).send("Could not add to wishlist");
        }
    },

    async removeItem(req, res) {
        try {
            const bookId = Number(req.body.bookId);
            if (!bookId) return res.redirect("/wishlist");
            await Wishlist.removeItem(req.session.user.id, bookId);
            res.redirect("/wishlist");
        } catch (err) {
            console.error("Wishlist remove error:", err);
            res.status(500).send("Could not remove from wishlist");
        }
    }
};
