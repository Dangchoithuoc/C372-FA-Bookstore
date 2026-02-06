const pool = require("../db");
const Refund = require("../models/Refund");
const Wallet = require("../models/Wallet");
const paypalService = require("../services/paypal");
const netsService = require("../services/nets");
const stripeService = require("../services/stripe");

const getCoverImagePath = (file) => (file ? `/uploads/books/${file.filename}` : null);

module.exports = {
    // Seller dashboard
    dashboard: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            
            // Get seller's books and stats
            const [books] = await pool.execute(
                "SELECT * FROM books WHERE seller_id = ? ORDER BY book_id DESC",
                [sellerId]
            );
            
            const [sales] = await pool.execute(
                `SELECT COUNT(DISTINCT o.order_id) as total_orders, 
                        SUM(o.total_price) as total_revenue,
                        SUM(oi.price_at_purchase) as total_book_sales
                 FROM orders o
                 JOIN order_items oi ON o.order_id = oi.order_id
                 JOIN books b ON oi.book_id = b.book_id
                 WHERE b.seller_id = ?`,
                [sellerId]
            );

            const [dailyRows] = await pool.execute(
                `SELECT DATE(o.order_date) AS day,
                        COUNT(DISTINCT o.order_id) AS orders,
                        COALESCE(SUM(oi.price_at_purchase), 0) AS revenue
                 FROM orders o
                 JOIN order_items oi ON o.order_id = oi.order_id
                 JOIN books b ON oi.book_id = b.book_id
                 WHERE b.seller_id = ?
                 GROUP BY DATE(o.order_date)
                 ORDER BY DATE(o.order_date) ASC
                 LIMIT 30`,
                [sellerId]
            );

            const [topBooksRows] = await pool.execute(
                `SELECT b.title,
                        COUNT(*) AS sold_count,
                        COALESCE(SUM(oi.price_at_purchase), 0) AS revenue
                 FROM order_items oi
                 JOIN books b ON oi.book_id = b.book_id
                 WHERE b.seller_id = ?
                 GROUP BY b.book_id, b.title
                 ORDER BY sold_count DESC
                 LIMIT 5`,
                [sellerId]
            );
            
            res.render("seller/dashboard", {
                user: req.session.user,
                books: books || [],
                stats: sales[0] || { total_orders: 0, total_revenue: 0, total_book_sales: 0 },
                chartDaily: dailyRows || [],
                chartTopBooks: topBooksRows || []
            });
        } catch (err) {
            console.error("Seller dashboard error:", err);
            res.status(500).send("Error loading dashboard");
        }
    },

    // List seller's books
    listBooks: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const [books] = await pool.execute(
                "SELECT * FROM books WHERE seller_id = ? ORDER BY book_id DESC",
                [sellerId]
            );
            
            res.render("seller/books", {
                user: req.session.user,
                books: books || []
            });
        } catch (err) {
            console.error("List books error:", err);
            res.status(500).send("Error loading books");
        }
    },

    // Show new book form
    newBookPage: (req, res) => {
        res.render("seller/book-form", {
            user: req.session.user,
            book: null,
            action: "Create",
            error: null // Add this line
        });
    },

    // Create new book
    createBook: async (req, res) => {
        try {
            const { title, author, genre, price, stock } = req.body;
            const sellerId = req.session.user.id;
            const coverImage = getCoverImagePath(req.file);

            if (req.fileValidationError) {
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: { ...req.body, coverImage },
                    action: "Create",
                    error: req.fileValidationError
                });
            }
            
            if (!title || !author || !price) {
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: { ...req.body, coverImage }, // Pass the submitted data back
                    action: "Create", // Include action
                    error: "Title, author, and price are required"
                });
            }
            const safeStock = Math.max(0, Number(stock) || 0);
            
            const [result] = await pool.execute(
                "INSERT INTO books (title, author, genre, price, stock, seller_id, coverImage) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [title, author, genre || null, parseFloat(price), safeStock, sellerId, coverImage]
            );
            
            res.redirect("/seller/books");
        } catch (err) {
            console.error("Create book error:", err);
            res.render("seller/book-form", {
                user: req.session.user,
                book: { ...req.body, coverImage: getCoverImagePath(req.file) }, // Pass the submitted data back
                action: "Create", // Include action
                error: "Error creating book"
            });
        }
    },

    // Show edit book form
    editBookPage: async (req, res) => {
        try {
            const { id } = req.params;
            const sellerId = req.session.user.id;
            
            const [books] = await pool.execute(
                "SELECT * FROM books WHERE book_id = ? AND seller_id = ?",
                [id, sellerId]
            );
            
            if (books.length === 0) {
                return res.redirect("/seller/books");
            }
            
            res.render("seller/book-form", {
                user: req.session.user,
                book: books[0],
                action: "Update",
                error: null // Add this line
            });
        } catch (err) {
            console.error("Edit book page error:", err);
            res.redirect("/seller/books");
        }
    },

    // Update book
    updateBook: async (req, res) => {
        let currentBook = null;
        try {
            const { id } = req.params;
            const { title, author, genre, price, stock } = req.body;
            const sellerId = req.session.user.id;
            const coverImageFromFile = getCoverImagePath(req.file);

            const [books] = await pool.execute(
                "SELECT * FROM books WHERE book_id = ? AND seller_id = ?",
                [id, sellerId]
            );

            if (books.length === 0) {
                return res.redirect("/seller/books");
            }

            currentBook = books[0];
            const finalCoverImage = coverImageFromFile || currentBook.coverImage || null;

            if (req.fileValidationError) {
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: { ...currentBook, ...req.body, coverImage: finalCoverImage },
                    action: "Update",
                    error: req.fileValidationError
                });
            }

            if (!title || !author || !price) {
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: { ...currentBook, ...req.body, coverImage: finalCoverImage },
                    action: "Update",
                    error: "Title, author, and price are required"
                });
            }

            const safeStock = Math.max(0, Number(stock) || 0);
            await pool.execute(
                "UPDATE books SET title = ?, author = ?, genre = ?, price = ?, stock = ?, coverImage = ? WHERE book_id = ? AND seller_id = ?",
                [title, author, genre || null, parseFloat(price), safeStock, finalCoverImage, id, sellerId]
            );

            res.redirect("/seller/books");
        } catch (err) {
            console.error("Update book error:", err);
            // On error, try to get the original book data
            try {
                const sellerId = req.session.user.id;
                const { id } = req.params;
                const [books] = await pool.execute(
                    "SELECT * FROM books WHERE book_id = ? AND seller_id = ?",
                    [id, sellerId]
                );

                res.render("seller/book-form", {
                    user: req.session.user,
                    book: currentBook || (books.length > 0 ? { ...books[0], ...req.body } : req.body),
                    action: "Update",
                    error: "Error updating book"
                });
            } catch (err2) {
                res.redirect("/seller/books");
            }
        }
    },

    // Delete book
    deleteBook: async (req, res) => {
        try {
            const { id } = req.params;
            const sellerId = req.session.user.id;
            
            await pool.execute(
                "DELETE FROM books WHERE book_id = ? AND seller_id = ?",
                [id, sellerId]
            );
            
            res.redirect("/seller/books");
        } catch (err) {
            console.error("Delete book error:", err);
            res.redirect("/seller/books");
        }
    },

    // List refund requests for seller's books
    listRefunds: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const [rows] = await pool.execute(
                `SELECT r.refund_id,
                        r.order_item_id,
                        r.amount,
                        r.method,
                        r.status,
                        r.requested_at,
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
                 WHERE b.seller_id = ?
                 ORDER BY r.requested_at DESC`,
                [sellerId]
            );

            res.render("seller/refunds", {
                user: req.session.user,
                refunds: rows || []
            });
        } catch (err) {
            console.error("Seller refunds list error:", err);
            res.status(500).send("Could not load refunds");
        }
    },

    // Approve / Reject refund for seller's books
    decideRefund: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const refundId = Number(req.params.id);
            const decision = (req.body.decision || "").trim().toLowerCase();

            if (!Number.isFinite(refundId)) return res.redirect("/seller/refunds");
            if (decision !== "approve" && decision !== "reject") {
                return res.redirect("/seller/refunds");
            }

            const [rows] = await pool.execute(
                `SELECT r.refund_id,
                        r.status,
                        r.method,
                        r.amount,
                        o.buyer_id,
                        p.payment_method,
                        p.provider_txn_id,
                        p.provider_txn_ref
                 FROM refunds r
                 JOIN order_items oi ON oi.order_item_id = r.order_item_id
                 JOIN books b ON b.book_id = oi.book_id
                 JOIN orders o ON o.order_id = oi.order_id
                 LEFT JOIN payment p ON p.order_id = o.order_id
                 WHERE r.refund_id = ? AND b.seller_id = ?
                 LIMIT 1`,
                [refundId, sellerId]
            );

            const refund = rows[0];
            if (!refund || refund.status !== "Pending") {
                return res.redirect("/seller/refunds");
            }

            if (decision === "reject") {
                await Refund.setStatus(refundId, "Rejected", req.session.user.id);
                return res.redirect("/seller/refunds");
            }

            if (refund.method === "wallet") {
                await Wallet.credit(refund.buyer_id, refund.amount, "refund_wallet");
                await Refund.setStatus(refundId, "Approved", req.session.user.id);
                return res.redirect("/seller/refunds");
            }

            const paymentMethod = String(refund.payment_method || "").toLowerCase();
            if (paymentMethod === "paypal") {
                await paypalService.refundCapture(refund.provider_txn_id, refund.amount);
                await Refund.setStatus(refundId, "Approved", req.session.user.id);
                return res.redirect("/seller/refunds");
            }
            if (paymentMethod === "nets") {
                await netsService.refundNets({
                    txnRetrievalRef: refund.provider_txn_ref,
                    amount: refund.amount
                });
                await Refund.setStatus(refundId, "Approved", req.session.user.id);
                return res.redirect("/seller/refunds");
            }
            if (paymentMethod === "stripe") {
                await stripeService.refundPaymentIntent(refund.provider_txn_id, refund.amount);
                await Refund.setStatus(refundId, "Approved", req.session.user.id);
                return res.redirect("/seller/refunds");
            }

            return res.redirect("/seller/refunds");
        } catch (err) {
            console.error("Seller decide refund error:", err);
            res.redirect("/seller/refunds");
        }
    }
};
