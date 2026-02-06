const pool = require("../db");

module.exports = {
    async getUnreadCount(userId) {
        const [rows] = await pool.execute(
            "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
            [userId]
        );
        return Number(rows[0]?.cnt || 0);
    },

    async getUnreadCountByTypes(userId, types) {
        const safeTypes = Array.isArray(types) ? types.filter(Boolean) : [];
        if (!safeTypes.length) return 0;
        const placeholders = safeTypes.map(() => "?").join(", ");
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS cnt
             FROM notifications
             WHERE user_id = ? AND is_read = 0 AND type IN (${placeholders})`,
            [userId, ...safeTypes]
        );
        return Number(rows[0]?.cnt || 0);
    },

    async create(userId, type, message, link = null) {
        await pool.execute(
            "INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)",
            [userId, type, message, link]
        );
    },

    async createMany(userIds, type, message, link = null) {
        const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
        if (!ids.length) return;
        const values = ids.map(() => "(?, ?, ?, ?)").join(", ");
        const params = [];
        for (const id of ids) {
            params.push(id, type, message, link);
        }
        await pool.execute(
            `INSERT INTO notifications (user_id, type, message, link) VALUES ${values}`,
            params
        );
    },

    async markAllRead(userId) {
        await pool.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
            [userId]
        );
    },

    async markReadByTypes(userId, types) {
        const safeTypes = Array.isArray(types) ? types.filter(Boolean) : [];
        if (!safeTypes.length) return;
        const placeholders = safeTypes.map(() => "?").join(", ");
        await pool.execute(
            `UPDATE notifications
             SET is_read = 1
             WHERE user_id = ? AND is_read = 0 AND type IN (${placeholders})`,
            [userId, ...safeTypes]
        );
    }
};
