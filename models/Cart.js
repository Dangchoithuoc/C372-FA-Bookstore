const pool = require("../db");
const Offer = require("./Offer");

async function ensureCart(userId) {
    const [rows] = await pool.execute("SELECT cart_id FROM cart WHERE user_id = ? LIMIT 1", [userId]);
    if (rows.length > 0) return rows[0].cart_id;
    const [result] = await pool.execute("INSERT INTO cart (user_id, total_amount) VALUES (?, 0)", [userId]);
    return result.insertId;
}

module.exports = {
    ensureCart,

    async getCart(userId) {
        const cartId = await ensureCart(userId);
        const [items] = await pool.execute(
            `SELECT ci.cart_item_id,
                    b.book_id AS id,
                    b.title,
                    b.price AS original_price,
                    COALESCE(o.offered_price, b.price) AS price,
                    b.coverImage,
                    b.stock,
                    ci.quantity AS qty,
                    o.offer_id AS offer_id
             FROM cart_items ci
             JOIN books b ON ci.book_id = b.book_id
             LEFT JOIN offers o
               ON o.book_id = b.book_id
              AND o.buyer_id = ?
              AND o.status = 'accepted'
              AND o.is_active = 1
              AND (o.expires_at IS NULL OR o.expires_at > NOW())
             WHERE ci.cart_id = ?`,
            [userId, cartId]
        );
        const total = items.reduce((sum, item) => {
            const price = Number(item.price || 0);
            const qty = Number(item.qty || 0);
            return sum + price * qty;
        }, 0);
        await pool.execute("UPDATE cart SET total_amount = ? WHERE cart_id = ?", [total, cartId]);
        return { cartId, items, total };
    },

    async addItem(userId, bookId, qty) {
        const cartId = await ensureCart(userId);
        let safeQty = Math.max(1, Number(qty) || 1);
        const [bookRows] = await pool.execute("SELECT stock FROM books WHERE book_id = ? LIMIT 1", [bookId]);
        const stock = bookRows[0] ? Number(bookRows[0].stock || 0) : 0;
        if (stock <= 0) {
            return cartId;
        }

        const acceptedPrice = await Offer.getAcceptedPriceForBuyerBook(userId, bookId);
        if (Number.isFinite(acceptedPrice)) {
            // Offer applies to a single copy only.
            safeQty = 1;
        }

        const [existingRows] = await pool.execute(
            "SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND book_id = ?",
            [cartId, bookId]
        );
        if (existingRows.length) {
            const desiredQty = existingRows[0].quantity + safeQty;
            const newQty = Number.isFinite(acceptedPrice)
                ? 1
                : Math.min(desiredQty, stock);
            await pool.execute(
                "UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?",
                [newQty, existingRows[0].cart_item_id]
            );
        } else {
            const insertQty = Number.isFinite(acceptedPrice) ? 1 : Math.min(safeQty, stock);
            await pool.execute(
                "INSERT INTO cart_items (cart_id, book_id, quantity) VALUES (?, ?, ?)",
                [cartId, bookId, insertQty]
            );
        }
        return cartId;
    },

    async updateItem(userId, bookId, qty) {
        const cartId = await ensureCart(userId);
        let newQty = Number(qty);
        const acceptedPrice = await Offer.getAcceptedPriceForBuyerBook(userId, bookId);
        if (Number.isFinite(acceptedPrice)) {
            newQty = 1;
        }
        if (!Number.isFinite(newQty) || newQty <= 0) {
            await pool.execute(
                "DELETE FROM cart_items WHERE cart_id = ? AND book_id = ?",
                [cartId, bookId]
            );
        } else {
            await pool.execute(
                "UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND book_id = ?",
                [newQty, cartId, bookId]
            );
        }
    },

    async removeItem(userId, bookId) {
        const cartId = await ensureCart(userId);
        await pool.execute(
            "DELETE FROM cart_items WHERE cart_id = ? AND book_id = ?",
            [cartId, bookId]
        );
    },

    async clearCart(userId) {
        const cartId = await ensureCart(userId);
        await pool.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
        await pool.execute("UPDATE cart SET total_amount = 0 WHERE cart_id = ?", [cartId]);
    }
};
