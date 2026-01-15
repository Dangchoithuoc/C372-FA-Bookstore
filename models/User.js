const pool = require("../db");

module.exports = {
    async findByEmail(email) {
        const [rows] = await pool.execute(
            "SELECT user_id AS id, username, email, user_password AS password_hash, role FROM users WHERE email = ? LIMIT 1",
            [email.toLowerCase()]
        );
        return rows[0] || null;
    },

    async findById(id) {
        const [rows] = await pool.execute(
            "SELECT user_id AS id, username, email, contact_number, address, role FROM users WHERE user_id = ? LIMIT 1",
            [id]
        );
        return rows[0] || null;
    },

    async listAll() {
        const [rows] = await pool.execute(
            "SELECT user_id AS id, username, email, contact_number, address, role FROM users ORDER BY user_id ASC"
        );
        return rows;
    },

    async create({ name, email, password }) {
        const normalizedEmail = email.toLowerCase();
        const [result] = await pool.execute(
            "INSERT INTO users (username, email, user_password, role) VALUES (?, ?, ?, 'buyer')",
            [name, normalizedEmail, password]
        );
        return { id: result.insertId, name, email: normalizedEmail, role: "buyer" };
    },

    async updateProfile({ id, username, email, contactNumber, address, password }) {
        const normalizedEmail = email.toLowerCase();
        const fields = ["username = ?", "email = ?", "contact_number = ?", "address = ?"];
        const params = [username, normalizedEmail, contactNumber || null, address || null];
        if (password) {
            fields.push("user_password = ?");
            params.push(password);
        }
        params.push(id);
        const sql = `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`;
        await pool.execute(sql, params);
        return { id, username, email: normalizedEmail, contact_number: contactNumber || null, address: address || null };
    },

    async updateByAdmin({ id, username, email, contactNumber, address, role, password }) {
        const normalizedEmail = email.toLowerCase();
        const fields = ["username = ?", "email = ?", "contact_number = ?", "address = ?", "role = ?"];
        const params = [username, normalizedEmail, contactNumber || null, address || null, role];
        if (password) {
            fields.push("user_password = ?");
            params.push(password);
        }
        params.push(id);
        const sql = `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`;
        await pool.execute(sql, params);
        return { id, username, email: normalizedEmail, contact_number: contactNumber || null, address: address || null, role };
    }
};
