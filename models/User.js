const pool = require("../db");

module.exports = {
    async findByEmail(email) {
        const [rows] = await pool.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1",
            [email.toLowerCase()]
        );
        return rows[0] || null;
    },

    async create({ name, email, password }) {
        const normalizedEmail = email.toLowerCase();
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, normalizedEmail, password]
        );
        return { id: result.insertId, name, email: normalizedEmail };
    }
};
