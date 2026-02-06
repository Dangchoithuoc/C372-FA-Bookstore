const pool = require("../db");
const bcrypt = require("bcrypt");

module.exports = {
    async findById(userId) {
        try {
            const [rows] = await pool.execute(
                "SELECT user_id AS id, username, email, contact_number, address, user_password, role, disabled FROM users WHERE user_id = ? LIMIT 1",
                [userId]
            );
            return rows[0] || null;
        } catch (err) {
            console.error("Find by id error:", err);
            return null;
        }
    },

    async findByEmail(email) {
        try {
            const [rows] = await pool.execute(
                "SELECT user_id AS id, username, email, user_password, role, disabled FROM users WHERE email = ? LIMIT 1",
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
    },

    async emailInUse(email, userId) {
        try {
            const [rows] = await pool.execute(
                "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
                [email.toLowerCase(), userId]
            );
            return rows.length > 0;
        } catch (err) {
            console.error("Email in use check error:", err);
            return true;
        }
    },

    async updateProfile(userId, { name, email, contact_number, address, password }) {
        try {
            const fields = [];
            const values = [];

            if (typeof name === "string") {
                fields.push("username = ?");
                values.push(name);
            }
            if (typeof email === "string") {
                fields.push("email = ?");
                values.push(email.toLowerCase());
            }
            if (typeof contact_number === "string") {
                fields.push("contact_number = ?");
                values.push(contact_number || null);
            }
            if (typeof address === "string") {
                fields.push("address = ?");
                values.push(address || null);
            }
            if (typeof password === "string" && password.length) {
                const saltRounds = 10;
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                fields.push("user_password = ?");
                values.push(hashedPassword);
            }

            if (!fields.length) return false;

            values.push(userId);
            await pool.execute(
                `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`,
                values
            );
            return true;
        } catch (err) {
            console.error("Update profile error:", err);
            throw err;
        }
    },

    async setRole(userId, role) {
        try {
            const validRoles = ["buyer", "seller", "admin"];
            if (!validRoles.includes(role)) {
                throw new Error(`Invalid role: ${role}`);
            }
            const [result] = await pool.execute(
                "UPDATE users SET role = ? WHERE user_id = ?",
                [role, userId]
            );
            return result.affectedRows > 0;
        } catch (err) {
            console.error("Set role error:", err);
            throw err;
        }
    }
};
