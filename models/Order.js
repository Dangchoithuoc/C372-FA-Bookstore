const pool = require("../db");

module.exports = {
  async checkout(userId, paymentMethod = "Manual", delivery = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1) Get cart + total
      const [cartRows] = await conn.execute(
        "SELECT cart_id, total_amount FROM cart WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (!cartRows.length) {
        throw new Error("Cart not found");
      }

      const cartId = cartRows[0].cart_id;
      const totalAmount = Number(cartRows[0].total_amount || 0);

      // 2) Check cart has items
      const [cartItems] = await conn.execute(
        "SELECT book_id FROM cart_items WHERE cart_id = ?",
        [cartId]
      );
      if (!cartItems.length) {
        throw new Error("Cart is empty");
      }

      // 3) Create order
      const [orderResult] = await conn.execute(
        "INSERT INTO orders (buyer_id, total_price) VALUES (?, ?)",
        [userId, totalAmount]
      );
      const orderId = orderResult.insertId;

      // 4) Move cart_items -> order_items
      await conn.execute(
        `INSERT INTO order_items (order_id, book_id, price_at_purchase, delivery_status)
         SELECT ?, ci.book_id, b.price, 'Pending'
         FROM cart_items ci
         JOIN books b ON ci.book_id = b.book_id
         WHERE ci.cart_id = ?`,
        [orderId, cartId]
      );

      // 5) Insert delivery (NEW)
      // delivery expected shape:
      // { type: "SHIP"|"PICKUP", location: "...", scheduled_time: "..."|null }
      if (delivery && delivery.type) {
        await conn.execute(
          `INSERT INTO delivery (order_id, delivery_type, delivery_status, location, scheduled_time)
           VALUES (?, ?, ?, ?, ?)`,
          [
            orderId,
            delivery.type,                  // "SHIP" or "PICKUP"
            "Pending",                      // default status
            delivery.location || null,      // address or pickup location
            delivery.scheduled_time || null // pickup slot or null
          ]
        );
      }
      // If delivery must always exist, you could throw here instead.

      // 6) Clear cart + reset total
      await conn.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
      await conn.execute("UPDATE cart SET total_amount = 0 WHERE cart_id = ?", [cartId]);

      // 7) Payment record
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
          oi.delivery_status,
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

  async getSellerOrders(sellerId) {
    const [rows] = await pool.execute(
      `SELECT 
          o.order_id,
          o.order_date,
          p.payment_method,
          p.payment_status,
          oi.order_item_id,
          oi.book_id,
          oi.price_at_purchase,
          oi.delivery_status,
          b.title,
          b.author,
          b.genre,
          b.coverImage,
          u.user_id AS buyer_id,
          u.username AS buyer_name,
          u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.user_id = o.buyer_id
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       WHERE b.seller_id = ?
       ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id ASC`,
      [sellerId]
    );
    return rows;
  },

  async getAllOrders() {
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
          oi.delivery_status,
          b.title,
          b.author,
          b.genre,
          b.coverImage,
          u.user_id AS buyer_id,
          u.username AS buyer_name,
          u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.user_id = o.buyer_id
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id ASC`
    );
    return rows;
  },

  async updateItemDeliveryStatus(orderItemId, sellerId, status) {
    const [result] = await pool.execute(
      `UPDATE order_items oi
       JOIN books b ON b.book_id = oi.book_id
       SET oi.delivery_status = ?
       WHERE oi.order_item_id = ? AND b.seller_id = ?`,
      [status, orderItemId, sellerId]
    );
    return result.affectedRows > 0;
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
