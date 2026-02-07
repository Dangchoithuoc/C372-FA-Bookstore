const pool = require("../db");

module.exports = {
    async getFeatured() {
        const [rows] = await pool.execute(
            "SELECT book_id AS id, title, author, price, genre AS tagline, coverImage, stock FROM books WHERE stock > 0 ORDER BY book_id ASC LIMIT 1"
        );
        const featured = rows[0];
        if (!featured) return null;
        return {
            ...featured,
            price: Number(featured.price) || 0,
            badge: featured.tagline || "Featured",
            description: featured.tagline || "A new arrival waiting on the front table."
        };
    },

    async getStaffPicks(limit = 6) {
        const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 6;
        const [rows] = await pool.query(
            `SELECT book_id AS id, title, author, price, genre AS vibe, coverImage, stock FROM books WHERE stock > 0 ORDER BY book_id DESC LIMIT ${safeLimit}`
        );
        return rows.map(row => ({
            ...row,
            price: Number(row.price) || 0
        }));
    },

    async getShelves() {
        const [rows] = await pool.execute(
            "SELECT COALESCE(genre, 'General') AS label, COUNT(*) AS count FROM books WHERE stock > 0 GROUP BY COALESCE(genre, 'General') ORDER BY count DESC"
        );
        if (rows.length === 0) {
            return [
                { label: "Fiction", blurb: "Character-forward novels and transporting stories.", accent: "#fff7ed" },
                { label: "Non-fiction", blurb: "Curious essays, culture writing, and modern history.", accent: "#e0f2fe" },
                { label: "Young Adult", blurb: "Coming-of-age adventures with heart.", accent: "#f3e8ff" },
                { label: "Comics & Art", blurb: "Illustrated worlds, risograph gems, and graphic novels.", accent: "#ecfeff" }
            ];
        }
        return rows.map((row, idx) => ({
            label: row.label || `Shelf ${idx + 1}`,
            blurb: `${row.count} titles ready to browse`,
            accent: ["#fff7ed", "#e0f2fe", "#f3e8ff", "#ecfeff"][idx % 4]
        }));
    },

    async findById(id) {
        const [rows] = await pool.execute(
            "SELECT book_id AS id, title, author, price, genre AS vibe, coverImage, stock FROM books WHERE book_id = ? AND stock > 0 LIMIT 1",
            [id]
        );
        const book = rows[0];
        return book ? { ...book, price: Number(book.price) || 0 } : null;
    },

    async findDetails(id) {
        const [rows] = await pool.execute(
            `SELECT b.book_id AS id,
                    b.title,
                    b.author,
                    b.genre,
                    b.price,
                    b.coverImage,
                    b.stock,
                    u.user_id AS sellerId,
                    u.username AS sellerName
             FROM books b
             LEFT JOIN users u ON u.user_id = b.seller_id
             WHERE b.book_id = ? AND b.stock > 0
             LIMIT 1`,
            [id]
        );
        const book = rows[0];
        return book ? { ...book, price: Number(book.price) || 0 } : null;
    },

   // Add this method to models/Book.js
    async getFilteredBooks({ search, genre, priceRange, sortBy, currentUserId, userRole }) {
        let query = 'SELECT book_id, title, author, genre, price, seller_id, coverImage, stock FROM books WHERE stock > 0';
        const params = [];
        
        // CRITICAL FIX: Apply seller filter BEFORE other filters
        if (userRole === 'seller' && currentUserId) {
            query += ' AND seller_id = ?';
            params.push(currentUserId);
        }
        // Buyers, admins, and guests see all books
        // (no additional filter needed)
        
        // Now apply the user's search/filter criteria
        if (search) {
            query += ' AND (title LIKE ? OR author LIKE ? OR genre LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        if (genre) {
            query += ' AND genre = ?';
            params.push(genre);
        }
        
        if (priceRange) {
            if (priceRange === '0-15') {
                query += ' AND price < 15';
            } else if (priceRange === '15-20') {
                query += ' AND price >= 15 AND price <= 20';
            } else if (priceRange === '20+') {
                query += ' AND price > 20';
            }
        }
        
        switch (sortBy) {
            case 'title_desc':
                query += ' ORDER BY title DESC';
                break;
            case 'price_asc':
                query += ' ORDER BY price ASC';
                break;
            case 'price_desc':
                query += ' ORDER BY price DESC';
                break;
            case 'title_asc':
            default:
                query += ' ORDER BY title ASC';
                break;
        }
        
        try {
            const [rows] = await pool.execute(query, params);
            return rows.map(row => ({
                ...row,
                price: Number(row.price) || 0,
                book_id: row.book_id
            }));
        } catch (err) {
            console.error("Error fetching filtered books:", err);
            return [];
        }
    },
};
