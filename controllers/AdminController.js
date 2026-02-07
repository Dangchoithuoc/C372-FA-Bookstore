const pool = require("../db");
const Refund = require("../models/Refund");
const Wallet = require("../models/Wallet");
const paypalService = require("../services/paypal");
const netsService = require("../services/nets");
const stripeService = require("../services/stripe");
const User = require("../models/User");

// Helper to mask emails for admin display
function maskEmail(email = "") {
  const str = String(email);
  const at = str.indexOf("@");
  if (at <= 1) return str;
  const name = str.slice(0, at);
  const domain = str.slice(at + 1);
  const visible = name.slice(0, 2);
  return `${visible}***@${domain}`;
}

module.exports = {
  dashboard: async (req, res) => {
    try {
      const [topBuyerRows] = await pool.execute(
        `SELECT u.user_id, u.username, COALESCE(SUM(o.total_price), 0) AS total_spend
         FROM users u
         LEFT JOIN orders o ON o.buyer_id = u.user_id
         WHERE u.role = 'buyer'
         GROUP BY u.user_id, u.username
         ORDER BY total_spend DESC
         LIMIT 5`
      );

      const [topSellerRows] = await pool.execute(
        `SELECT u.user_id, u.username, COALESCE(SUM(oi.price_at_purchase), 0) AS total_sales
         FROM users u
         JOIN books b ON b.seller_id = u.user_id
         JOIN order_items oi ON oi.book_id = b.book_id
         WHERE u.role = 'seller'
         GROUP BY u.user_id, u.username
         ORDER BY total_sales DESC
         LIMIT 5`
      );

      res.render("admin/dashboard", {
        user: req.session.user,
        topBuyers: topBuyerRows || [],
        topSellers: topSellerRows || []
      });
    } catch (err) {
      console.error("Admin dashboard error:", err);
      res.render("admin/dashboard", {
        user: req.session.user,
        topBuyers: [],
        topSellers: []
      });
    }
  },

  salesReport: async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT DATE(order_date) AS day,
                COUNT(*) AS orders,
                COALESCE(SUM(total_price), 0) AS revenue
         FROM orders
         GROUP BY DATE(order_date)
         ORDER BY DATE(order_date) DESC
         LIMIT 90`
      );

      let csv = "date,orders,revenue\n";
      for (const r of rows) {
        const date = r.day ? new Date(r.day).toISOString().slice(0, 10) : "";
        csv += `${date},${r.orders},${Number(r.revenue || 0).toFixed(2)}\n`;
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=\"sales-report.csv\"");
      res.send(csv);
    } catch (err) {
      console.error("Sales report error:", err);
      res.status(500).send("Could not generate report");
    }
  },

  chartsPage: async (req, res) => {
    try {
      const [dailyRows] = await pool.execute(
        `SELECT DATE_FORMAT(order_date, '%Y-%m-%d %H:%i') AS minute,
                COUNT(*) AS orders,
                COALESCE(SUM(total_price), 0) AS revenue
         FROM orders
         WHERE order_date >= (NOW() - INTERVAL 2 HOUR)
         GROUP BY minute
         ORDER BY minute ASC`
      );

      const [topBuyerRows] = await pool.execute(
        `SELECT u.username, COALESCE(SUM(o.total_price), 0) AS total_spend
         FROM users u
         LEFT JOIN orders o ON o.buyer_id = u.user_id
         WHERE u.role = 'buyer'
         GROUP BY u.user_id, u.username
         ORDER BY total_spend DESC
         LIMIT 5`
      );

      const [topSellerRows] = await pool.execute(
        `SELECT u.username, COALESCE(SUM(oi.price_at_purchase), 0) AS total_sales
         FROM users u
         LEFT JOIN books b ON b.seller_id = u.user_id
         LEFT JOIN order_items oi ON oi.book_id = b.book_id
         WHERE u.role = 'seller'
         GROUP BY u.user_id, u.username
         ORDER BY total_sales DESC`
      );

      res.render("admin/charts", {
        user: req.session.user,
        chartDaily: dailyRows || [],
        chartTopBuyers: topBuyerRows || [],
        chartTopSellers: topSellerRows || []
      });
    } catch (err) {
      console.error("Admin charts error:", err);
      res.status(500).send("Could not load charts");
    }
  },

  listUsers: async (req, res) => {
    try {
      const searchQuery = String(req.query.search || "").trim();
      const params = [];
      let whereClause = "";

      if (searchQuery) {
        whereClause = `
          WHERE (u.username LIKE ? OR u.email LIKE ?)
        `;
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
      }

      const [users] = await pool.execute(
        `SELECT
          u.user_id,
          u.username,
          u.email,
          u.role,
          u.disabled,
          COUNT(DISTINCT o.order_id) AS orders_count,
          COALESCE(SUM(o.total_price), 0) AS total_spent,
          MAX(o.order_date) AS last_order_date
        FROM users u
        LEFT JOIN orders o ON o.buyer_id = u.user_id
        ${whereClause}
        GROUP BY u.user_id, u.username, u.email, u.role, u.disabled
        ORDER BY u.user_id DESC`,
        params
      );

      const safeUsers = (users || []).map(u => ({
        ...u,
        email_masked: maskEmail(u.email)
      }));

      res.render("admin/users", {
        user: req.session.user,
        users: safeUsers,
        success: req.query.success || null,
        error: req.query.error || null,
        searchQuery
      });
    } catch (err) {
      console.error("List users error:", err);
      res.redirect("/admin/dashboard");
    }
  },

  promoteUser: async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isFinite(targetId)) {
        return res.redirect("/admin/users?error=Invalid user");
      }

      if (targetId === req.session.user.id) {
        return res.redirect("/admin/users?error=You already have admin access");
      }

      const targetUser = await User.findById(targetId);
      if (!targetUser) {
        return res.redirect("/admin/users?error=User not found");
      }

      if (targetUser.role === "admin") {
        return res.redirect("/admin/users?error=User is already an admin");
      }

      await User.setRole(targetId, "admin");
      res.redirect("/admin/users?success=User promoted to admin");
    } catch (err) {
      console.error("Promote user error:", err);
      res.redirect("/admin/users?error=Could not promote user");
    }
  },

  // Admin: View all orders (optional buyer filter)
  listOrders: async (req, res) => {
    try {
      const buyerId = req.query.buyer ? Number(req.query.buyer) : null;

      const params = [];
      let where = "";
      if (buyerId && Number.isFinite(buyerId)) {
        where = "WHERE o.buyer_id = ?";
        params.push(buyerId);
      }

      const [rows] = await pool.execute(
        `SELECT
            o.order_id,
            o.total_price,
            o.order_date,
            o.buyer_id,
            u.username AS buyer_name,
            u.email AS buyer_email,

            oi.order_item_id,
            oi.price_at_purchase,

            b.title,
            b.author,
            b.genre,

            d.delivery_status,

            r.rating AS review_rating,
            r.comment AS review_comment
         FROM orders o
         JOIN users u ON u.user_id = o.buyer_id
         JOIN order_items oi ON oi.order_id = o.order_id
         JOIN books b ON b.book_id = oi.book_id
         LEFT JOIN delivery d ON d.order_id = o.order_id
         LEFT JOIN reviews r ON r.order_item_id = oi.order_item_id
         ${where}
         ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id ASC`,
        params
      );

      const map = new Map();

      for (const r of rows) {
        if (!map.has(r.order_id)) {
          map.set(r.order_id, {
            id: r.order_id,
            order_date: r.order_date,
            total_price: Number(r.total_price || 0),
            buyer_id: r.buyer_id,
            buyer_name: r.buyer_name,
            buyer_email: maskEmail(r.buyer_email),
            items: []
          });
        }

        map.get(r.order_id).items.push({
          title: r.title,
          author: r.author,
          genre: r.genre,
          price: Number(r.price_at_purchase || 0),
          delivery_status: r.delivery_status || "Pending",
          review_rating: r.review_rating || null,
          review_comment: r.review_comment || null
        });
      }

      res.render("admin/orders", {
        user: req.session.user,
        orders: Array.from(map.values())
      });
    } catch (err) {
      console.error("Admin listOrders error:", err);
      res.status(500).send("Could not load orders");
    }
  },

  // Admin: View all sales for a seller (?seller=ID)
  listSellerSales: async (req, res) => {
    try {
      const sellerId = req.query.seller ? Number(req.query.seller) : null;
      if (!sellerId || !Number.isFinite(sellerId)) {
        return res.status(400).send("seller is required");
      }

      const [rows] = await pool.execute(
        `SELECT
            o.order_id,
            o.order_date,
            u.username AS buyer_name,
            u.email AS buyer_email,
            b.title,
            b.author,
            b.genre,
            oi.price_at_purchase
         FROM orders o
         JOIN users u ON u.user_id = o.buyer_id
         JOIN order_items oi ON oi.order_id = o.order_id
         JOIN books b ON b.book_id = oi.book_id
         WHERE b.seller_id = ?
         ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id ASC`,
        [sellerId]
      );

      const map = new Map();

      for (const r of rows) {
        if (!map.has(r.order_id)) {
          map.set(r.order_id, {
            id: r.order_id,
            order_date: r.order_date,
            buyer_name: r.buyer_name,
            buyer_email: maskEmail(r.buyer_email),
            items: []
          });
        }

        map.get(r.order_id).items.push({
          title: r.title,
          author: r.author,
          genre: r.genre,
          price: Number(r.price_at_purchase || 0)
        });
      }

      res.render("admin/sales", {
        user: req.session.user,
        orders: Array.from(map.values())
      });
    } catch (err) {
      console.error("Admin listSellerSales error:", err);
      res.status(500).send("Could not load seller sales");
    }
  },

  listAllBooks: async (req, res) => {
    try {
      const bookSearch = String(req.query.bookSearch || "").trim();
      const params = [];
      let whereClause = "";

      if (bookSearch) {
        whereClause = `
          WHERE b.stock > 0
            AND (b.title LIKE ? OR b.author LIKE ? OR u.username LIKE ?)
        `;
        params.push(`%${bookSearch}%`, `%${bookSearch}%`, `%${bookSearch}%`);
      } else {
        whereClause = "WHERE b.stock > 0";
      }

      const [books] = await pool.execute(
        `SELECT b.*, u.username as seller_name 
         FROM books b 
         JOIN users u ON b.seller_id = u.user_id 
         ${whereClause}
         ORDER BY b.book_id DESC`,
        params
      );

      res.render("admin/books", {
        user: req.session.user,
        books: books || [],
        success: req.query.success || null,
        error: req.query.error || null,
        bookSearch
      });
    } catch (err) {
      console.error("List books error:", err);
      res.redirect("/admin/dashboard");
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      if (parseInt(id) === req.session.user.id) {
        return res.redirect("/admin/users?error=Cannot delete your own account");
      }

      await pool.execute("DELETE FROM users WHERE user_id = ?", [id]);
      res.redirect("/admin/users?success=User deleted successfully");
    } catch (err) {
      console.error("Delete user error:", err);
      res.redirect("/admin/users?error=Could not delete user");
    }
  },

  listRefunds: async (req, res) => {
    try {
      const refunds = await Refund.getAll();
      res.render("admin/refunds", {
        user: req.session.user,
        refunds: refunds || []
      });
    } catch (err) {
      console.error("List refunds error:", err);
      res.redirect("/admin/dashboard");
    }
  },

  decideRefund: async (req, res) => {
    try {
      const refundId = Number(req.params.id);
      const decision = (req.body.decision || "").trim().toLowerCase();
      if (!Number.isFinite(refundId)) return res.redirect("/admin/refunds");
      if (decision !== "approve" && decision !== "reject") return res.redirect("/admin/refunds");

      const refund = await Refund.getById(refundId);
      if (!refund || refund.status !== "Pending") return res.redirect("/admin/refunds");

      if (decision === "reject") {
        await Refund.setStatus(refundId, "Rejected", req.session.user.id);
        return res.redirect("/admin/refunds");
      }

      if (refund.method === "wallet") {
        await Wallet.credit(refund.buyer_id, refund.amount, "refund_wallet");
        await Refund.setStatus(refundId, "Approved", req.session.user.id);
        return res.redirect("/admin/refunds");
      }

      const paymentMethod = String(refund.payment_method || "").toLowerCase();
      if (paymentMethod === "paypal") {
        await paypalService.refundCapture(refund.provider_txn_id, refund.amount);
      } else if (paymentMethod === "nets") {
        await netsService.refundNets({
          txnRetrievalRef: refund.provider_txn_ref,
          amount: refund.amount
        });
      } else if (paymentMethod === "ewallet") {
        await Wallet.credit(refund.buyer_id, refund.amount, "refund_wallet");
      } else if (paymentMethod === "stripe") {
        await stripeService.refundPaymentIntent(refund.provider_txn_id, refund.amount);
      }

      await Refund.setStatus(refundId, "Approved", req.session.user.id);
      return res.redirect("/admin/refunds");
    } catch (err) {
      console.error("Decide refund error:", err);
      res.redirect("/admin/refunds");
    }
  },

  toggleUserDisabled: async (req, res) => {
    try {
      const { id } = req.params;
      if (parseInt(id) === req.session.user.id) {
        return res.redirect("/admin/users?error=Cannot disable your own account");
      }

      const { action } = req.body || {};
      const disabled = action === "disable" ? 1 : 0;

      await pool.execute("UPDATE users SET disabled = ? WHERE user_id = ?", [disabled, id]);
      res.redirect("/admin/users?success=User updated successfully");
    } catch (err) {
      console.error("Toggle user disabled error:", err);
      res.redirect("/admin/users?error=Could not update user");
    }
  },

  deleteBook: async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;
      await conn.beginTransaction();

      await conn.execute("DELETE FROM cart_items WHERE book_id = ?", [id]);
      await conn.execute("DELETE FROM wishlist_items WHERE book_id = ?", [id]);
      await conn.execute("UPDATE books SET stock = 0 WHERE book_id = ?", [id]);

      await conn.commit();
      res.redirect("/admin/books?success=Book deleted successfully");
    } catch (err) {
      await conn.rollback();
      console.error("Delete book error:", err);
      res.redirect("/admin/books?error=Could not delete book");
    } finally {
      conn.release();
    }
  }
};
