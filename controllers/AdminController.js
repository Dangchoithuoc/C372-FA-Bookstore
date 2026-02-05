const pool = require("../db");

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
                `SELECT DATE(order_date) AS day,
                        COUNT(*) AS orders,
                        COALESCE(SUM(total_price), 0) AS revenue
                 FROM orders
                 GROUP BY DATE(order_date)
                 ORDER BY DATE(order_date) ASC
                 LIMIT 30`
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
                 JOIN books b ON b.seller_id = u.user_id
                 JOIN order_items oi ON oi.book_id = b.book_id
                 WHERE u.role = 'seller'
                 GROUP BY u.user_id, u.username
                 ORDER BY total_sales DESC
                 LIMIT 5`
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
    
    // User Management
    listUsers: async (req, res) => {
        try {
            const [users] = await pool.execute(
                "SELECT user_id, username, email, role, disabled FROM users ORDER BY user_id DESC"
            );
            
            res.render("admin/users", {
                user: req.session.user,
                users: users || [],
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (err) {
            console.error("List users error:", err);
            res.redirect("/admin/dashboard");
        }
    },
    
    // Book Management
    listAllBooks: async (req, res) => {
        try {
            const [books] = await pool.execute(
                `SELECT b.*, u.username as seller_name 
                 FROM books b 
                 JOIN users u ON b.seller_id = u.user_id 
                 ORDER BY b.book_id DESC`
            );
            
            res.render("admin/books", {
                user: req.session.user,
                books: books || [],
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (err) {
            console.error("List books error:", err);
            res.redirect("/admin/dashboard");
        }
    },
    
    // Delete User (with confirmation)
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            
            // Prevent deleting yourself
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

    // Disable / Enable User
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
    
    // Delete Book
    deleteBook: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.execute("DELETE FROM books WHERE book_id = ?", [id]);
            res.redirect("/admin/books?success=Book deleted successfully");
        } catch (err) {
            console.error("Delete book error:", err);
            res.redirect("/admin/books?error=Could not delete book");
        }
    }
};
