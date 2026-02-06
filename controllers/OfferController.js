const Book = require("../models/Book");
const Offer = require("../models/Offer");
const Notification = require("../models/Notification");

const OFFER_EXPIRY_HOURS = 24;

module.exports = {
    createOffer: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user || user.role !== "buyer") {
                return res.status(403).send("Access denied.");
            }

            const bookId = Number(req.body.book_id);
            const offeredPrice = Number(req.body.offered_price);
            const reason = (req.body.reason || "").trim();

            if (!Number.isFinite(bookId) || !Number.isFinite(offeredPrice) || offeredPrice <= 0) {
                return res.status(400).send("Invalid offer.");
            }

            const book = await Book.findDetails(bookId);
            if (!book) {
                return res.status(404).send("Book not found");
            }
            if (Number(book.sellerId) === Number(user.id)) {
                return res.status(400).send("You cannot negotiate your own book.");
            }
            const originalPrice = Number(book.price) || 0;
            if (offeredPrice >= originalPrice) {
                return res.status(400).send("Offer must be lower than the original price.");
            }

            const existing = await Offer.getActiveForBuyerBook(user.id, bookId);
            if (existing && existing.status === "pending") {
                return res.status(400).send("You already have a pending offer for this book.");
            }
            if (existing && existing.status === "accepted") {
                return res.status(400).send("You already have an accepted offer for this book.");
            }

            const expiresAt = new Date(Date.now() + OFFER_EXPIRY_HOURS * 60 * 60 * 1000);
            const offerId = await Offer.create(user.id, bookId, book.sellerId, offeredPrice, reason, expiresAt);

            try {
                await Notification.create(
                    book.sellerId,
                    "offer_request",
                    `New offer: $${offeredPrice.toFixed(2)} for ${book.title}`,
                    "/seller/offers"
                );
            } catch (err) {
                console.error("Offer notification error:", err);
            }

            return res.redirect(`/books/${bookId}`);
        } catch (err) {
            console.error("Create offer error:", err);
            res.status(500).send("Could not create offer");
        }
    },

    listSellerOffers: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user || user.role !== "seller") {
                return res.status(403).send("Access denied.");
            }
            const offers = await Offer.getPendingForSeller(user.id);
            res.render("seller/offers", {
                user,
                offers
            });
        } catch (err) {
            console.error("List seller offers error:", err);
            res.status(500).send("Could not load offers");
        }
    },

    decideOffer: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user || user.role !== "seller") {
                return res.status(403).send("Access denied.");
            }

            const offerId = Number(req.params.id);
            const decision = (req.body.decision || "").trim().toLowerCase();
            if (!Number.isFinite(offerId) || (decision !== "accept" && decision !== "reject")) {
                return res.redirect("/seller/offers");
            }

            const offer = await Offer.getByIdForSeller(offerId, user.id);
            if (!offer || offer.status !== "pending") {
                return res.redirect("/seller/offers");
            }

            const result = await Offer.setDecision(offerId, user.id, decision);
            const statusLabel = result.status === "accepted" ? "Accepted" : "Rejected";

            try {
                await Notification.create(
                    offer.buyer_id,
                    "offer_update",
                    `Offer ${statusLabel}: ${offer.title}`,
                    "/offers"
                );
            } catch (err) {
                console.error("Offer update notification error:", err);
            }

            return res.redirect("/seller/offers");
        } catch (err) {
            console.error("Decide offer error:", err);
            res.status(500).send("Failed to decide offer");
        }
    },

    listBuyerOffers: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user || user.role !== "buyer") {
                return res.status(403).send("Access denied.");
            }
            const offers = await Offer.getForBuyer(user.id);
            res.render("buyer-offers", {
                user,
                offers
            });
        } catch (err) {
            console.error("List buyer offers error:", err);
            res.status(500).send("Could not load offers");
        }
    }
};
