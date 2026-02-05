const pool = require("../db");

const TIERS = [
  { name: "Bronze", threshold: 100, discount: 5 },
  { name: "Silver", threshold: 300, discount: 10 },
  { name: "Gold", threshold: 600, discount: 20 }
];

function resolveTier(totalSpend) {
  let tier = { name: "Member", threshold: 0, discount: 0 };
  for (const t of TIERS) {
    if (totalSpend >= t.threshold) {
      tier = t;
    }
  }
  const next = TIERS.find(t => t.threshold > totalSpend) || null;
  return { tier, next };
}

module.exports = {
  TIERS,

  async getTotalSpend(userId) {
    const [rows] = await pool.execute(
      "SELECT COALESCE(SUM(total_price), 0) AS total_spend FROM orders WHERE buyer_id = ?",
      [userId]
    );
    return Number(rows[0]?.total_spend || 0);
  },

  async getMembership(userId) {
    const totalSpend = await this.getTotalSpend(userId);
    const { tier, next } = resolveTier(totalSpend);
    return { totalSpend, tier, next };
  },

  getTierForSpend(totalSpend) {
    return resolveTier(Number(totalSpend || 0));
  },

  async computeTotals(userId, subtotal, applyMembership) {
    const safeSubtotal = Number(subtotal || 0);
    let discountPercent = 0;
    let membership = null;

    if (applyMembership) {
      membership = await this.getMembership(userId);
      discountPercent = Number(membership.tier.discount || 0);
    } else {
      membership = await this.getMembership(userId);
    }

    const discountAmount = Number(((safeSubtotal * discountPercent) / 100).toFixed(2));
    const total = Number(Math.max(0, safeSubtotal - discountAmount).toFixed(2));

    return {
      subtotal: safeSubtotal,
      discountPercent,
      discountAmount,
      total,
      membership
    };
  }
};
