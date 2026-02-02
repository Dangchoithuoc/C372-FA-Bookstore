const pool = require("../db");

module.exports = {
    async listAll() {
        const [rows] = await pool.execute(
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             ORDER BY b.book_id ASC`
        );
        return rows;
    },

    async listBySeller(sellerId) {
        const [rows] = await pool.execute(
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             WHERE b.seller_id = ?
             ORDER BY b.book_id ASC`,
            [sellerId]
        );
        return rows;
    },

    async create({ title, author, price, genre, sellerId }) {
        const [result] = await pool.execute(
            "INSERT INTO books (title, author, price, genre, seller_id) VALUES (?, ?, ?, ?, ?)",
            [title, author, price, genre || null, sellerId]
        );
        return { id: result.insertId, title, author, price, genre, sellerId };
    },

    async update({ id, title, author, price, genre, sellerId }) {
        await pool.execute(
            "UPDATE books SET title = ?, author = ?, price = ?, genre = ? WHERE book_id = ? AND seller_id = ?",
            [title, author, price, genre || null, id, sellerId]
        );
        return { id, title, author, price, genre, sellerId };
    },

    async remove(id, sellerId) {
        await pool.execute("DELETE FROM books WHERE book_id = ? AND seller_id = ?", [id, sellerId]);
        return true;
    },

    async getFeatured() {
        const [rows] = await pool.execute(
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre AS tagline, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             ORDER BY b.book_id ASC
             LIMIT 1`
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
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre AS vibe, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             ORDER BY b.book_id DESC
             LIMIT ${safeLimit}`
        );
        return rows.map(row => ({
            ...row,
            price: Number(row.price) || 0
        }));
    },

    async getShelves() {
        const [rows] = await pool.execute(
            "SELECT COALESCE(genre, 'General') AS label, COUNT(*) AS count FROM books GROUP BY COALESCE(genre, 'General') ORDER BY count DESC"
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
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre AS vibe, b.genre, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             WHERE b.book_id = ?
             LIMIT 1`,
            [id]
        );
        const book = rows[0];
        return book ? { ...book, price: Number(book.price) || 0 } : null;
    },

   // Add this method to models/Book.js
    async getFilteredBooks({ search, genre, priceRange, sortBy, currentUserId, userRole }) {
        let query = 'SELECT book_id, title, author, genre, price, seller_id FROM books WHERE 1=1';
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