const Order = require("../models/Order");

const DELIVERY_STATUSES = ["Pending", "Processing", "Shipping", "Delivered"];

module.exports = {
    purchaseHistory: async (req, res) => {
        try {
            const user = req.session.user;
            const userId = user.id;
            const role = user.role || "buyer";
            let rows = [];

            if (role === "admin") {
                rows = await Order.getAllOrders();
            } else if (role === "seller") {
                rows = await Order.getSellerOrders(userId);
            } else {
                rows = await Order.getBuyerHistory(userId);
            }

            const orders = [];
            const index = new Map();

            for (const row of rows) {
                if (!index.has(row.order_id)) {
                    const order = {
                        id: row.order_id,
                        total_price: role === "seller" ? 0 : (Number(row.total_price) || 0),
                        order_date: row.order_date,
                        payment_method: row.payment_method || null,
                        payment_status: row.payment_status || null,
                        buyer_name: row.buyer_name || null,
                        buyer_email: row.buyer_email || null,
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
                    price: Number(row.price_at_purchase) || 0,
                    delivery_status: row.delivery_status || "Pending"
                });
                if (role === "seller") {
                    const current = index.get(row.order_id);
                    current.total_price += Number(row.price_at_purchase) || 0;
                }
            }

            if (role === "admin") {
                return res.render("admin/orders", {
                    user,
                    orders
                });
            }

            res.render("purchase-history", {
                user,
                orders,
                deliveryStatuses: DELIVERY_STATUSES,
                pageTitle: role === "seller" ? "Sales orders" : "Purchase history",
                pageSubtitle: role === "seller"
                    ? "Orders that include your books."
                    : "Review your past orders and the books you purchased.",
                emptyMessage: role === "seller"
                    ? "No orders yet. When customers buy your books, they will appear here."
                    : "No orders yet. Once you check out, they will appear here."
            });
        } catch (err) {
            console.error("Purchase history error:", err);
            res.status(500).send("Could not load purchase history");
        }
    },

    updateDeliveryStatus: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user || user.role !== "seller") {
                return res.status(403).send("Access denied.");
            }

            const orderItemId = Number(req.params.id);
            const status = (req.body.status || "").trim();

            if (!Number.isFinite(orderItemId)) {
                return res.redirect("/orders");
            }
            if (!DELIVERY_STATUSES.includes(status)) {
                return res.status(400).send("Invalid delivery status.");
            }

            const updated = await Order.updateItemDeliveryStatus(orderItemId, user.id, status);
            if (!updated) {
                return res.status(403).send("Access denied.");
            }

            return res.redirect("/orders");
        } catch (err) {
            console.error("Update delivery status error:", err);
            res.status(500).send("Failed to update delivery status");
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
