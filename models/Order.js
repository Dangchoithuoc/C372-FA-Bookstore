const pool = require("../db");

module.exports = {
    async checkout(userId, paymentMethod = "Manual") {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [cartRows] = await conn.execute(
                "SELECT cart_id, total_amount FROM cart WHERE user_id = ? LIMIT 1",
                [userId]
            );
            if (!cartRows.length) {
                throw new Error("Cart not found");
            }

            const cartId = cartRows[0].cart_id;
            const totalAmount = Number(cartRows[0].total_amount || 0);

            const [cartItems] = await conn.execute(
                "SELECT book_id FROM cart_items WHERE cart_id = ?",
                [cartId]
            );
            if (!cartItems.length) {
                throw new Error("Cart is empty");
            }

            const [orderResult] = await conn.execute(
                "INSERT INTO orders (buyer_id, total_price) VALUES (?, ?)",
                [userId, totalAmount]
            );
            const orderId = orderResult.insertId;

            await conn.execute(
                `INSERT INTO order_items (order_id, book_id, price_at_purchase)
                 SELECT ?, ci.book_id, b.price
                 FROM cart_items ci
                 JOIN books b ON ci.book_id = b.book_id
                 WHERE ci.cart_id = ?`,
                [orderId, cartId]
            );

            await conn.execute(
                "DELETE FROM cart_items WHERE cart_id = ?",
                [cartId]
            );

            await conn.execute(
                "UPDATE cart SET total_amount = 0 WHERE cart_id = ?",
                [cartId]
            );

            await conn.execute(
                "INSERT INTO payment (order_id, payment_method, payment_status) VALUES (?, ?, ?)",
                [orderId, paymentMethod, "Paid"]
            );

            await conn.commit();
            return orderId;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getBuyerHistory(userId) {
        const [rows] = await pool.execute(
            `SELECT 
                o.order_id,
                o.total_price,
                o.order_date,
                p.payment_method,
                p.payment_status,
                oi.order_item_id,
                oi.book_id,
                oi.price_at_purchase,
                b.title,
                b.author,
                b.genre,
                b.coverImage
             FROM orders o
             LEFT JOIN payment p ON p.order_id = o.order_id
             JOIN order_items oi ON oi.order_id = o.order_id
             JOIN books b ON b.book_id = oi.book_id
             WHERE o.buyer_id = ?
             ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id ASC`,
            [userId]
        );
        return rows;
    },

    async getInvoice(orderId, userId) {
        const [orderRows] = await pool.execute(
            `SELECT 
                o.order_id,
                o.total_price,
                o.order_date,
                u.username,
                u.email,
                u.address,
                u.contact_number,
                p.payment_method,
                p.payment_status
             FROM orders o
             JOIN users u ON u.user_id = o.buyer_id
             LEFT JOIN payment p ON p.order_id = o.order_id
             WHERE o.order_id = ? AND o.buyer_id = ?
             LIMIT 1`,
            [orderId, userId]
        );

        if (!orderRows.length) return null;

        const [items] = await pool.execute(
            `SELECT 
                oi.order_item_id,
                oi.price_at_purchase,
                b.book_id,
                b.title,
                b.author,
                b.genre,
                b.coverImage
             FROM order_items oi
             JOIN books b ON b.book_id = oi.book_id
             WHERE oi.order_id = ?
             ORDER BY oi.order_item_id ASC`,
            [orderId]
        );

        return { order: orderRows[0], items };
    }
};
