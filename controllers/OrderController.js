const Order = require("../models/Order");

module.exports = {
    purchaseHistory: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const rows = await Order.getBuyerHistory(userId);

            const orders = [];
            const index = new Map();

            for (const row of rows) {
                if (!index.has(row.order_id)) {
                    const order = {
                        id: row.order_id,
                        total_price: Number(row.total_price) || 0,
                        order_date: row.order_date,
                        payment_method: row.payment_method || null,
                        payment_status: row.payment_status || null,
                        items: []
                    };
                    index.set(row.order_id, order);
                    orders.push(order);
                }
                index.get(row.order_id).items.push({
                    order_item_id: row.order_item_id,
                    book_id: row.book_id,
                    title: row.title,
                    author: row.author,
                    genre: row.genre,
                    coverImage: row.coverImage,
                    price: Number(row.price_at_purchase) || 0
                });
            }

            res.render("purchase-history", {
                user: req.session.user,
                orders
            });
        } catch (err) {
            console.error("Purchase history error:", err);
            res.status(500).send("Could not load purchase history");
        }
    },

    invoicePage: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const orderId = Number(req.params.id);
            if (!Number.isFinite(orderId)) {
                return res.redirect("/orders");
            }

            const invoice = await Order.getInvoice(orderId, userId);
            if (!invoice) {
                return res.status(404).send("Invoice not found");
            }

            const total = Number(invoice.order.total_price) || 0;
            res.render("invoice", {
                user: req.session.user,
                order: invoice.order,
                items: invoice.items.map(item => ({
                    ...item,
                    price: Number(item.price_at_purchase) || 0
                })),
                total
            });
        } catch (err) {
            console.error("Invoice error:", err);
            res.status(500).send("Could not load invoice");
        }
    }
};
