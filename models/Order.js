const pool = require("../db");

module.exports = {
  async checkout(userId, paymentMethod = "Manual", delivery = null, paymentMeta = null, discount = null) {
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
      const subtotalAmount = Number(cartRows[0].total_amount || 0);
      const discountPercent = discount && Number.isFinite(Number(discount.discountPercent))
        ? Number(discount.discountPercent)
        : 0;
      const discountAmount = discount && Number.isFinite(Number(discount.discountAmount))
        ? Number(discount.discountAmount)
        : 0;
      const totalAmount = discount && Number.isFinite(Number(discount.total))
        ? Number(discount.total)
        : Math.max(0, subtotalAmount - discountAmount);

      // 2) Check cart has items + stock
      const [cartItems] = await conn.execute(
        `SELECT ci.book_id, ci.quantity, b.stock
         FROM cart_items ci
         JOIN books b ON b.book_id = ci.book_id
         WHERE ci.cart_id = ?`,
        [cartId]
      );
      if (!cartItems.length) {
        throw new Error("Cart is empty");
      }
      for (const item of cartItems) {
        const stock = Number(item.stock || 0);
        if (stock < Number(item.quantity || 0)) {
          throw new Error("Insufficient stock for one or more items.");
        }
      }

      // 3) Create order
      const [orderResult] = await conn.execute(
        "INSERT INTO orders (buyer_id, total_price, discount_percent, discount_amount) VALUES (?, ?, ?, ?)",
        [userId, totalAmount, discountPercent, discountAmount]
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

      // 4a) Notify sellers about new order (best effort)
      try {
        const [sellerRows] = await conn.execute(
          `SELECT DISTINCT b.seller_id
           FROM cart_items ci
           JOIN books b ON b.book_id = ci.book_id
           WHERE ci.cart_id = ?`,
          [cartId]
        );
        if (sellerRows.length) {
          const values = sellerRows.map(() => "(?, ?, ?, ?)").join(", ");
          const params = [];
          for (const row of sellerRows) {
            params.push(
              row.seller_id,
              "order_new",
              `New order placed (Order #${orderId})`,
              "/orders"
            );
          }
          await conn.execute(
            `INSERT INTO notifications (user_id, type, message, link) VALUES ${values}`,
            params
          );
        }
      } catch (err) {
        console.error("Order notification error:", err);
      }

      // 4b) Decrement stock
      await conn.execute(
        `UPDATE books b
         JOIN cart_items ci ON ci.book_id = b.book_id
         SET b.stock = GREATEST(b.stock - ci.quantity, 0)
         WHERE ci.cart_id = ?`,
        [cartId]
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
      const providerTxnId = paymentMeta && paymentMeta.providerTxnId ? paymentMeta.providerTxnId : null;
      const providerTxnRef = paymentMeta && paymentMeta.providerTxnRef ? paymentMeta.providerTxnRef : null;
      await conn.execute(
        "INSERT INTO payment (order_id, payment_method, payment_status, provider_txn_id, provider_txn_ref) VALUES (?, ?, ?, ?, ?)",
        [orderId, paymentMethod, "Paid", providerTxnId, providerTxnRef]
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
          DATE_ADD(o.order_date, INTERVAL 8 HOUR) AS order_date,
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
          r.rating AS review_rating,
          r.comment AS review_comment,
          DATE_ADD(r.created_at, INTERVAL 8 HOUR) AS review_created_at,
          rf.refund_id AS refund_id,
          rf.status AS refund_status,
          rf.method AS refund_method,
          rf.amount AS refund_amount
       FROM orders o
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       LEFT JOIN reviews r ON r.order_item_id = oi.order_item_id
       LEFT JOIN refunds rf ON rf.order_item_id = oi.order_item_id
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
          DATE_ADD(o.order_date, INTERVAL 8 HOUR) AS order_date,
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
          u.email AS buyer_email,
          r.rating AS review_rating,
          r.comment AS review_comment,
          DATE_ADD(r.created_at, INTERVAL 8 HOUR) AS review_created_at,
          rf.refund_id AS refund_id,
          rf.status AS refund_status,
          rf.method AS refund_method,
          rf.amount AS refund_amount
       FROM orders o
       JOIN users u ON u.user_id = o.buyer_id
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       LEFT JOIN reviews r ON r.order_item_id = oi.order_item_id
       LEFT JOIN refunds rf ON rf.order_item_id = oi.order_item_id
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
          DATE_ADD(o.order_date, INTERVAL 8 HOUR) AS order_date,
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
          u.email AS buyer_email,
          r.rating AS review_rating,
          r.comment AS review_comment,
          r.created_at AS review_created_at,
          rf.refund_id AS refund_id,
          rf.status AS refund_status,
          rf.method AS refund_method,
          rf.amount AS refund_amount
       FROM orders o
       JOIN users u ON u.user_id = o.buyer_id
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       LEFT JOIN reviews r ON r.order_item_id = oi.order_item_id
       LEFT JOIN refunds rf ON rf.order_item_id = oi.order_item_id
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
          DATE_ADD(o.order_date, INTERVAL 8 HOUR) AS order_date,
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
  ,
  async getOrderItemForBuyer(orderItemId, userId) {
    const [rows] = await pool.execute(
      `SELECT 
          oi.order_item_id,
          oi.price_at_purchase,
          oi.delivery_status,
          b.book_id,
          b.title,
          b.author,
          b.genre,
          b.coverImage,
          DATE_ADD(o.order_date, INTERVAL 8 HOUR) AS order_date,
          o.total_price,
          p.payment_method,
          p.payment_status,
          r.review_id,
          rf.refund_id,
          rf.status AS refund_status
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       LEFT JOIN payment p ON p.order_id = o.order_id
       JOIN books b ON b.book_id = oi.book_id
       LEFT JOIN reviews r ON r.order_item_id = oi.order_item_id
       LEFT JOIN refunds rf ON rf.order_item_id = oi.order_item_id
       WHERE oi.order_item_id = ? AND o.buyer_id = ?
       LIMIT 1`,
      [orderItemId, userId]
    );
    return rows[0] || null;
  },

  async getOrderItemNotification(orderItemId) {
    const [rows] = await pool.execute(
      `SELECT 
          oi.order_item_id,
          o.order_id,
          o.buyer_id,
          b.title,
          b.seller_id
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN books b ON b.book_id = oi.book_id
       WHERE oi.order_item_id = ?
       LIMIT 1`,
      [orderItemId]
    );
    return rows[0] || null;
  }
};
