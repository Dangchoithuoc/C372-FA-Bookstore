const pool = require("../db");

async function ensureWallet(userId) {
  const [rows] = await pool.execute(
    "SELECT wallet_id, balance FROM wallet WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length) return rows[0];
  const [result] = await pool.execute(
    "INSERT INTO wallet (user_id, balance) VALUES (?, 0)",
    [userId]
  );
  return { wallet_id: result.insertId, balance: 0 };
}

module.exports = {
  async getWallet(userId) {
    const wallet = await ensureWallet(userId);
    const [txns] = await pool.execute(
      `SELECT transaction_id, amount, transaction_type, transaction_time
       FROM wallet_transactions
       WHERE wallet_id = ?
       ORDER BY transaction_id DESC
       LIMIT 20`,
      [wallet.wallet_id]
    );
    return { wallet, transactions: txns || [] };
  },

  async credit(userId, amount, type = "topup") {
    const wallet = await ensureWallet(userId);
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new Error("Invalid top up amount.");
    }

    await pool.execute(
      "UPDATE wallet SET balance = balance + ? WHERE wallet_id = ?",
      [safeAmount, wallet.wallet_id]
    );
    await pool.execute(
      "INSERT INTO wallet_transactions (wallet_id, amount, transaction_type) VALUES (?, ?, ?)",
      [wallet.wallet_id, safeAmount, type]
    );
  },

  async debit(userId, amount, type = "purchase") {
    const wallet = await ensureWallet(userId);
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new Error("Invalid debit amount.");
    }

    const [rows] = await pool.execute(
      "SELECT balance FROM wallet WHERE wallet_id = ? LIMIT 1",
      [wallet.wallet_id]
    );
    const balance = rows[0] ? Number(rows[0].balance || 0) : 0;
    if (balance < safeAmount) {
      throw new Error("Insufficient balance.");
    }

    await pool.execute(
      "UPDATE wallet SET balance = balance - ? WHERE wallet_id = ?",
      [safeAmount, wallet.wallet_id]
    );
    await pool.execute(
      "INSERT INTO wallet_transactions (wallet_id, amount, transaction_type) VALUES (?, ?, ?)",
      [wallet.wallet_id, -safeAmount, type]
    );
  }
};
