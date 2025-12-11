const pool = require("../db");

module.exports = {
    async getFeatured() {
        const [rows] = await pool.execute(
            "SELECT id, title, author, price, vibe AS tagline, badge FROM books WHERE is_featured = 1 ORDER BY id DESC LIMIT 1"
        );
        const featured = rows[0];
        if (!featured) return null;
        return {
            ...featured,
            description: featured.tagline || "A new arrival waiting on the front table."
        };
    },

    async getStaffPicks(limit = 6) {
        const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 6;
        const [rows] = await pool.query(
            `SELECT id, title, author, price, vibe, badge FROM books WHERE is_featured = 0 ORDER BY created_at DESC LIMIT ${safeLimit}`
        );
        return rows;
    },

    async getShelves() {
        // A lightweight derived list using counts; fallback to labels if empty
        const [rows] = await pool.execute(
            "SELECT badge AS label, COUNT(*) AS count FROM books GROUP BY badge ORDER BY count DESC"
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
    }
};
