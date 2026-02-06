const pool = require("../db");

module.exports = {
    async getActiveForBuyerBook(buyerId, bookId) {
        const [rows] = await pool.execute(
            `SELECT offer_id,
                    offered_price,
                    reason,
                    status,
                    is_active,
                    expires_at,
                    created_at
             FROM offers
             WHERE buyer_id = ? AND book_id = ? AND is_active = 1
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC
             LIMIT 1`,
            [buyerId, bookId]
        );
        return rows[0] || null;
    },

    async getAcceptedPriceForBuyerBook(buyerId, bookId) {
        const [rows] = await pool.execute(
            `SELECT offered_price
             FROM offers
             WHERE buyer_id = ? AND book_id = ? AND status = 'accepted' AND is_active = 1
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC
             LIMIT 1`,
            [buyerId, bookId]
        );
        const row = rows[0];
        return row ? Number(row.offered_price) : null;
    },

    async create(buyerId, bookId, sellerId, offeredPrice, reason, expiresAt) {
        const [result] = await pool.execute(
            `INSERT INTO offers (book_id, buyer_id, seller_id, offered_price, reason, status, is_active, expires_at)
             VALUES (?, ?, ?, ?, ?, 'pending', 1, ?)`,
            [bookId, buyerId, sellerId, offeredPrice, reason || null, expiresAt || null]
        );
        return result.insertId;
    },

    async getPendingForSeller(sellerId) {
        const [rows] = await pool.execute(
            `SELECT o.offer_id,
                    o.book_id,
                    o.buyer_id,
                    o.offered_price,
                    o.reason,
                    o.status,
                    o.created_at,
                    o.expires_at,
                    b.title,
                    u.username AS buyer_name,
                    u.email AS buyer_email
             FROM offers o
             JOIN books b ON b.book_id = o.book_id
             JOIN users u ON u.user_id = o.buyer_id
             WHERE o.seller_id = ? AND o.status = 'pending' AND o.is_active = 1
               AND (o.expires_at IS NULL OR o.expires_at > NOW())
             ORDER BY o.created_at DESC`,
            [sellerId]
        );
        return rows;
    },

    async getForBuyer(buyerId) {
        const [rows] = await pool.execute(
            `SELECT o.offer_id,
                    o.book_id,
                    o.offered_price,
                    o.reason,
                    o.status,
                    o.is_active,
                    o.created_at,
                    o.expires_at,
                    b.title,
                    b.author,
                    b.coverImage,
                    b.price AS original_price,
                    u.username AS seller_name
             FROM offers o
             JOIN books b ON b.book_id = o.book_id
             JOIN users u ON u.user_id = o.seller_id
             WHERE o.buyer_id = ?
             ORDER BY o.created_at DESC`,
            [buyerId]
        );
        return rows;
    },

    async getByIdForSeller(offerId, sellerId) {
        const [rows] = await pool.execute(
            `SELECT o.offer_id,
                    o.book_id,
                    o.buyer_id,
                    o.offered_price,
                    o.reason,
                    o.status,
                    o.is_active,
                    b.title
             FROM offers o
             JOIN books b ON b.book_id = o.book_id
             WHERE o.offer_id = ? AND o.seller_id = ?
             LIMIT 1`,
            [offerId, sellerId]
        );
        return rows[0] || null;
    },

    async setDecision(offerId, sellerId, decision) {
        const status = decision === "accept" ? "accepted" : "rejected";
        const isActive = decision === "accept" ? 1 : 0;
        await pool.execute(
            `UPDATE offers
             SET status = ?, is_active = ?, updated_at = NOW()
             WHERE offer_id = ? AND seller_id = ? AND status = 'pending'`,
            [status, isActive, offerId, sellerId]
        );
        return { status, isActive };
    },

    async deactivateAcceptedForBuyerBooks(buyerId, bookIds) {
        if (!Array.isArray(bookIds) || !bookIds.length) return;
        const placeholders = bookIds.map(() => "?").join(", ");
        await pool.execute(
            `UPDATE offers
             SET is_active = 0, updated_at = NOW()
             WHERE buyer_id = ? AND status = 'accepted' AND is_active = 1
               AND book_id IN (${placeholders})`,
            [buyerId, ...bookIds]
        );
    }
};
