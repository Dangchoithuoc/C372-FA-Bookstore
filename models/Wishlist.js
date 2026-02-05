const pool = require("../db");

module.exports = {
    async getWishlist(userId) {
        const [rows] = await pool.execute(
            `SELECT wi.book_id,
                    wi.created_at,
                    b.title,
                    b.author,
                    b.genre,
                    b.price,
                    b.coverImage
             FROM wishlist_items wi
             JOIN books b ON b.book_id = wi.book_id
             WHERE wi.user_id = ?
             ORDER BY wi.created_at DESC`,
            [userId]
        );
        return rows;
    },

    async addItem(userId, bookId) {
        await pool.execute(
            `INSERT IGNORE INTO wishlist_items (user_id, book_id)
             VALUES (?, ?)`,
            [userId, bookId]
        );
    },

    async removeItem(userId, bookId) {
        await pool.execute(
            "DELETE FROM wishlist_items WHERE user_id = ? AND book_id = ?",
            [userId, bookId]
        );
    }
};
