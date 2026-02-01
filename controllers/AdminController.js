const pool = require("../db");

module.exports = {
    dashboard: async (req, res) => {
        try {
            // Get admin stats
            const [userStats, bookStats, orderStats] = await Promise.all([
                pool.execute("SELECT COUNT(*) as count FROM users"),
                pool.execute("SELECT COUNT(*) as count FROM books"),
                pool.execute("SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as revenue FROM orders")
            ]);
            
            res.render("admin/dashboard", {
                user: req.session.user,
                stats: {
                    totalUsers: userStats[0][0].count || 0,
                    totalBooks: bookStats[0][0].count || 0,
                    totalOrders: orderStats[0][0].count || 0,
                    totalRevenue: orderStats[0][0].revenue || 0
                }
            });
        } catch (err) {
            console.error("Admin dashboard error:", err);
            res.render("admin/dashboard", {
                user: req.session.user,
                stats: { 
                    totalUsers: 0, 
                    totalBooks: 0, 
                    totalOrders: 0, 
                    totalRevenue: 0 
                }
            });
        }
    },
    
    // User Management
    listUsers: async (req, res) => {
        try {
            const [users] = await pool.execute(
                "SELECT user_id, username, email, role, created_at FROM users ORDER BY user_id DESC"
            );
            
            res.render("admin/users", {
                user: req.session.user,
                users: users || []
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
                books: books || []
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