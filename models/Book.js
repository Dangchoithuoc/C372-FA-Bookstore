const pool = require("../db");

module.exports = {
    async getFeatured() {
        const [rows] = await pool.execute(
            "SELECT book_id AS id, title, author, price, genre AS tagline FROM books ORDER BY book_id ASC LIMIT 1"
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
            `SELECT book_id AS id, title, author, price, genre AS vibe FROM books ORDER BY book_id DESC LIMIT ${safeLimit}`
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
            "SELECT book_id AS id, title, author, price, genre AS vibe, genre FROM books WHERE book_id = ? LIMIT 1",
            [id]
        );
        return rows[0] || null;
    }
};
