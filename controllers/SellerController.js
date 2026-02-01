const Book = require("../models/Book");
const pool = require("../db");

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
            
            res.render("seller/dashboard", {
                user: req.session.user,
                books: books || [],
                stats: sales[0] || { total_orders: 0, total_revenue: 0, total_book_sales: 0 }
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
            const { title, author, genre, price } = req.body;
            const sellerId = req.session.user.id;
            
            if (!title || !author || !price) {
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: req.body, // Pass the submitted data back
                    action: "Create", // Include action
                    error: "Title, author, and price are required"
                });
            }
            
            const [result] = await pool.execute(
                "INSERT INTO books (title, author, genre, price, seller_id) VALUES (?, ?, ?, ?, ?)",
                [title, author, genre || null, parseFloat(price), sellerId]
            );
            
            res.redirect("/seller/books");
        } catch (err) {
            console.error("Create book error:", err);
            res.render("seller/book-form", {
                user: req.session.user,
                book: req.body, // Pass the submitted data back
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
        try {
            const { id } = req.params;
            const { title, author, genre, price } = req.body;
            const sellerId = req.session.user.id;
            
            if (!title || !author || !price) {
                // Get the book to preserve other data
                const [books] = await pool.execute(
                    "SELECT * FROM books WHERE book_id = ? AND seller_id = ?",
                    [id, sellerId]
                );
                
                return res.render("seller/book-form", {
                    user: req.session.user,
                    book: books.length > 0 ? { ...books[0], ...req.body } : req.body,
                    action: "Update",
                    error: "Title, author, and price are required"
                });
            }
            
            await pool.execute(
                "UPDATE books SET title = ?, author = ?, genre = ?, price = ? WHERE book_id = ? AND seller_id = ?",
                [title, author, genre || null, parseFloat(price), id, sellerId]
            );
            
            res.redirect("/seller/books");
        } catch (err) {
            console.error("Update book error:", err);
            // On error, try to get the original book data
            try {
                const [books] = await pool.execute(
                    "SELECT * FROM books WHERE book_id = ? AND seller_id = ?",
                    [id, sellerId]
                );
                
                res.render("seller/book-form", {
                    user: req.session.user,
                    book: books.length > 0 ? { ...books[0], ...req.body } : req.body,
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
    }
};