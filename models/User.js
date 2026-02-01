const pool = require("../db");
const bcrypt = require("bcrypt");

module.exports = {
    async findByEmail(email) {
        try {
            const [rows] = await pool.execute(
                "SELECT user_id AS id, username, email, user_password, role FROM users WHERE email = ? LIMIT 1",
                [email.toLowerCase()]
            );
            return rows[0] || null;
        } catch (err) {
            console.error("Find by email error:", err);
            return null;
        }
    },

    async create({ name, email, password, role = 'buyer' }) {
        try {
            const normalizedEmail = email.toLowerCase();
            
            // Hash the password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            
            const [result] = await pool.execute(
                "INSERT INTO users (username, email, user_password, role) VALUES (?, ?, ?, ?)",
                [name, normalizedEmail, hashedPassword, role]
            );
            
            return { 
                id: result.insertId, 
                name, 
                email: normalizedEmail, 
                role 
            };
        } catch (err) {
            console.error("Create user error:", err);
            throw err;
        }
    }
};