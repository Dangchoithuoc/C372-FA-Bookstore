const pool = require("../db");

module.exports = {
    async getByBookId(bookId) {
        const [rows] = await pool.execute(
            `SELECT r.review_id,
                    r.rating,
                    r.comment,
                    r.created_at,
                    u.username
             FROM reviews r
             JOIN users u ON u.user_id = r.buyer_id
             WHERE r.book_id = ?
             ORDER BY r.created_at DESC`,
            [bookId]
        );
        return rows;
    },

    async createForOrderItem(userId, orderItemId, rating, comment) {
        const [result] = await pool.execute(
            `INSERT IGNORE INTO reviews (order_item_id, book_id, buyer_id, rating, comment)
             SELECT oi.order_item_id, oi.book_id, o.buyer_id, ?, ?
             FROM order_items oi
             JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.order_item_id = ?
               AND o.buyer_id = ?
               AND oi.delivery_status = 'Delivered'`,
            [rating, comment || null, orderItemId, userId]
        );
        return result.affectedRows > 0;
    }
};
