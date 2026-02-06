const Cart = require("../models/Cart");
const paypalService = require("../services/paypal");
const Order = require("../models/Order");
const Membership = require("../models/Membership");

const TAX_RATE = 0; // keep tax zero until we have rates from requirements

function formatCartForView(items) {
    const mapped = items.map(item => ({
        productName: item.title,
        quantity: Number(item.qty),
        price: Number(item.price)
    }));
    const subtotal = mapped.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = Number((subtotal * TAX_RATE).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    return {
        items: mapped,
        totals: {
            subtotal,
            tax,
            total
        }
    };
}

module.exports = {
    paypalPage: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { items = [] } = await Cart.getCart(userId);
            const cart = formatCartForView(items);
            const applyMembership = req.session.checkoutDetails?.apply_membership !== false;
            const totals = await Membership.computeTotals(userId, cart.totals.total, applyMembership);
            cart.totals.total = totals.total;

            res.render("checkout-paypal", {
                user: req.session.user,
                cart,
                discountPercent: totals.discountPercent,
                discountAmount: totals.discountAmount,
                shippingAddress: req.session.user.name || req.session.user.email || "Not provided",
                paypalClientId: process.env.PAYPAL_CLIENT_ID
            });
        } catch (err) {
            console.error("PayPal page error", err);
            res.status(500).send("Unable to load PayPal checkout");
        }
    },

    createOrder: async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { items = [] } = await Cart.getCart(userId);
            const cart = formatCartForView(items);
            const applyMembership = req.session.checkoutDetails?.apply_membership !== false;
            const totals = await Membership.computeTotals(userId, cart.totals.total, applyMembership);
            cart.totals.total = totals.total;
            if (cart.totals.total <= 0) {
                return res.status(400).json({ error: "Cart is empty" });
            }

            const returnUrl = `${req.protocol}://${req.get("host")}/checkout`;
            const cancelUrl = `${req.protocol}://${req.get("host")}/checkout`;

            const order = await paypalService.createOrder(cart.totals.total.toFixed(2), "SGD", {
                returnUrl,
                cancelUrl
            });

            res.json(order);
        } catch (err) {
            console.error("PayPal create-order error", err);
            res.status(500).json({ error: err.message || "Unable to create PayPal order" });
        }
    },

    captureOrder: async (req, res) => {
        try {
            const { orderId } = req.body || {};
            if (!orderId) {
                return res.status(400).json({ error: "orderId is required" });
            }

            const captureResult = await paypalService.captureOrder(orderId);
            const captureId =
                captureResult?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

            const applyMembership = req.session.checkoutDetails?.apply_membership !== false;
            const totals = await Membership.computeTotals(req.session.user.id, (await Cart.getCart(req.session.user.id)).total, applyMembership);
            const orderDbId = await Order.checkout(req.session.user.id, "PayPal", null, {
                providerTxnId: captureId
            }, {
                discountPercent: totals.discountPercent,
                discountAmount: totals.discountAmount,
                total: totals.total
            });
            if (!orderDbId) {
                return res.status(500).json({ error: "Order could not be created" });
            }

            res.json({ success: true, capture: captureResult, invoiceUrl: `/invoice/${orderDbId}` });
        } catch (err) {
            console.error("PayPal capture error", err);
            res.status(500).json({ error: err.message || "Unable to capture PayPal order" });
        }
    }
};
