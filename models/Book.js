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
        return rows;
    },

    async getShelves() {
        // A lightweight derived list using counts; fallback to labels if empty
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
        return rows[0] || null;
    },

    async findByIdForSeller(id, sellerId) {
        const [rows] = await pool.execute(
            `SELECT b.book_id AS id, b.title, b.author, b.price, b.genre, b.seller_id, u.username AS seller_name
             FROM books b
             LEFT JOIN users u ON b.seller_id = u.user_id
             WHERE b.book_id = ? AND b.seller_id = ?
             LIMIT 1`,
            [id, sellerId]
        );
        return rows[0] || null;
    }
};
