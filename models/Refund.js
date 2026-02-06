const pool = require("../db");

module.exports = {
    async getAll() {
        const [rows] = await pool.execute(
            `SELECT r.refund_id,
                    r.order_item_id,
                    r.amount,
                    r.method,
                    r.status,
                    r.reason,
                    r.note,
                    r.proof_url,
                    r.requested_at,
                    r.resolved_at,
                    r.resolved_by,
                    b.title,
                    b.book_id,
                    u.user_id AS buyer_id,
                    u.username AS buyer_name,
                    u.email AS buyer_email,
                    p.payment_method
             FROM refunds r
             JOIN order_items oi ON oi.order_item_id = r.order_item_id
             JOIN books b ON b.book_id = oi.book_id
             JOIN orders o ON o.order_id = oi.order_id
             LEFT JOIN payment p ON p.order_id = o.order_id
             JOIN users u ON u.user_id = o.buyer_id
             ORDER BY r.requested_at DESC`
        );
        return rows;
    },

    async getById(refundId) {
        const [rows] = await pool.execute(
            `SELECT r.refund_id,
                    r.order_item_id,
                    r.amount,
                    r.method,
                    r.status,
                    r.requested_at,
                    o.buyer_id,
                    p.payment_method,
                    p.provider_txn_id,
                    p.provider_txn_ref
             FROM refunds r
             JOIN order_items oi ON oi.order_item_id = r.order_item_id
             JOIN orders o ON o.order_id = oi.order_id
             LEFT JOIN payment p ON p.order_id = o.order_id
             WHERE r.refund_id = ?
             LIMIT 1`,
            [refundId]
        );
        return rows[0] || null;
    },

    async setStatus(refundId, status, adminId) {
        await pool.execute(
            `UPDATE refunds
             SET status = ?, resolved_at = NOW(), resolved_by = ?
             WHERE refund_id = ?`,
            [status, adminId, refundId]
        );
    },

    async request(userId, orderItemId, method, reason, note, proofUrl) {
        const [rows] = await pool.execute(
            `SELECT oi.order_item_id,
                    oi.price_at_purchase,
                    oi.delivery_status,
                    o.buyer_id
             FROM order_items oi
             JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.order_item_id = ?`,
            [orderItemId]
        );
        if (!rows.length) return { ok: false, reason: "not_found" };
        const row = rows[0];
        if (Number(row.buyer_id) !== Number(userId)) return { ok: false, reason: "forbidden" };
        if (row.delivery_status !== "Delivered") return { ok: false, reason: "not_delivered" };

        const safeMethod = method === "wallet" ? "wallet" : "original";
        const amount = Number(row.price_at_purchase || 0);
        if (amount <= 0) return { ok: false, reason: "invalid_amount" };

        const [insert] = await pool.execute(
            `INSERT IGNORE INTO refunds (order_item_id, amount, method, status, reason, note, proof_url)
             VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
            [orderItemId, amount, safeMethod, reason || null, note || null, proofUrl || null]
        );
        return { ok: insert.affectedRows > 0 };
    },

    async decide(refundId, decision, adminId) {
        const status = decision === "approve" ? "Approved" : "Rejected";
        await this.setStatus(refundId, status, adminId);
        return { ok: true, status };
    }
};
