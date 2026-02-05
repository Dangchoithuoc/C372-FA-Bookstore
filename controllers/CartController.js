const Book = require("../models/Book");
const Cart = require("../models/Cart");

module.exports = {
    viewCart: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { items, total } = await Cart.getCart(userId);
            res.render("cart", { cart: items, total: total.toFixed(2), user: req.session.user });
        } catch (err) {
            console.error("View cart error", err);
            res.status(500).send("Could not load cart");
        }
    },

    addItem: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { bookId, qty } = req.body;
            const book = await Book.findById(bookId);
            if (!book) {
                return res.status(404).send("Book not found");
            }
            const stock = Number(book.stock ?? 0);
            if (stock <= 0) {
                return res.redirect(req.get("referer") || "/");
            }
            await Cart.addItem(userId, book.id, qty);
            res.redirect(req.get("referer") || "/");
        } catch (err) {
            console.error("Add to cart error", err);
            res.status(500).send("Could not add to cart");
        }
    },

    updateItem: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { id, qty } = req.body;
            const book = await Book.findById(id);
            const stock = Number(book && book.stock ? book.stock : 0);
            const safeQty = Math.min(Number(qty) || 0, stock);
            await Cart.updateItem(userId, id, safeQty);
            res.redirect("/cart");
        } catch (err) {
            console.error("Update cart error", err);
            res.status(500).send("Could not update cart");
        }
    },

    removeItem: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { id } = req.body;
            await Cart.removeItem(userId, id);
            res.redirect("/cart");
        } catch (err) {
            console.error("Remove cart item error", err);
            res.status(500).send("Could not remove item");
        }
    },

    clearCart: async (req, res) => {
        try {
            const userId = req.session.user.id;
            await Cart.clearCart(userId);
            res.redirect("/cart");
        } catch (err) {
            console.error("Clear cart error", err);
            res.status(500).send("Could not clear cart");
        }
    }
};
