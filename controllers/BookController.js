const Book = require("../models/Book");
const Cart = require("../models/Cart");

// Controller reads homepage content from MySQL-backed Book model with safe fallbacks and number coercion for prices.
module.exports = {
    homePage: async (req, res) => {
        try {
            const [spotlight, staffPicks, shelves] = await Promise.all([
                Book.getFeatured(),
                Book.getStaffPicks(6),
                Book.getShelves()
            ]);

            const resolvedSpotlight = normalizeSpotlight(spotlight) || normalizeSpotlight({
                title: "The Midnight Archive",
                author: "Clara Wren",
                tagline: "A bookshop mystery soaked in moonlight and old paper",
                description: "Follow archivist Elise Calder as she uncovers a century-old disappearance beneath the city's forgotten stacks.",
                price: 24.0,
                badge: "New Arrival"
            });

            const resolvedStaff = normalizeStaff(staffPicks) || normalizeStaff([
                { title: "Ink & Ember", author: "Ravi Iyer", price: 19.5, vibe: "Atmospheric fantasy", badge: "Staff pick" },
                { title: "Third Coast Essays", author: "Mae Lin", price: 17.0, vibe: "Sharp non-fiction", badge: "Essay" },
                { title: "Quiet Hours", author: "Nadia Bloom", price: 15.2, vibe: "Slow-burn romance", badge: "Comfort" }
            ]);

            const resolvedShelves = shelves && shelves.length > 0 ? shelves : [
                { label: "Fiction", blurb: "Character-forward novels and transporting stories.", accent: "#fff4e6" },
                { label: "Non-fiction", blurb: "Curious essays, culture writing, and modern history.", accent: "#e6f6ff" },
                { label: "Young Adult", blurb: "Coming-of-age adventures with heart.", accent: "#f4e9ff" },
                { label: "Comics & Art", blurb: "Illustrated worlds, risograph gems, and graphic novels.", accent: "#ecffe6" }
            ];

            let cartSummary = null;
            if (req.session.user && req.session.user.role === "buyer") {
                const { items, total } = await Cart.getCart(req.session.user.id);
                const count = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
                cartSummary = {
                    count,
                    total: Number(total || 0),
                    items: items.map(item => ({
                        id: item.id,
                        title: item.title,
                        qty: Number(item.qty || 0),
                        price: Number(item.price || 0)
                    }))
                };
            }

            const featuredBooks = buildFeatured(resolvedSpotlight, resolvedStaff);

            res.render("home", {
                spotlight: resolvedSpotlight,
                staffPicks: resolvedStaff,
                shelves: resolvedShelves,
                featuredBooks,
                cartSummary,
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Error loading homepage:", err);
            res.status(500).send("Failed to load homepage");
        }
    },

    bookDetails: async (req, res) => {
        try {
            const book = await Book.findById(req.params.id);
            if (!book) {
                return res.status(404).send("Book not found.");
            }
            const detail = normalizeDetail(book);
            res.render("book-details", { book: detail, user: req.session.user || null });
        } catch (err) {
            console.error("Error loading book detail:", err);
            res.status(500).send("Failed to load book.");
        }
    }
};

function normalizePrice(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function normalizeSpotlight(item) {
    if (!item) return null;
    return {
        id: item.id,
        title: item.title,
        author: item.author,
        sellerId: item.seller_id,
        sellerName: item.seller_name || "Independent seller",
        tagline: item.tagline,
        description: item.description || item.tagline || "",
        price: normalizePrice(item.price),
        badge: item.badge || "New Arrival",
        coverImage: coverForTitle(item.title)
    };
}

function normalizeStaff(list) {
    if (!list || list.length === 0) return null;
    return list.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        sellerId: b.seller_id,
        sellerName: b.seller_name || "Independent seller",
        price: normalizePrice(b.price),
        vibe: b.vibe,
        badge: b.badge || "Staff pick",
        coverImage: coverForTitle(b.title)
    }));
}

function normalizeDetail(item) {
    if (!item) return null;
    const genre = item.genre || item.vibe || "";
    const rawTagline = item.tagline || item.vibe || item.genre || "A fresh story for your shelf.";
    const displayTagline = isSameText(rawTagline, genre) ? "" : rawTagline;
    return {
        id: item.id,
        title: item.title,
        author: item.author,
        sellerId: item.seller_id,
        sellerName: item.seller_name || "Independent seller",
        genre,
        price: normalizePrice(item.price),
        tagline: displayTagline,
        description: buildDescription(item.title, rawTagline, genre),
        coverImage: coverForTitle(item.title)
    };
}

function buildDescription(title, tagline, genre) {
    const cleanTagline = isSameText(tagline, genre) ? "" : tagline;
    if (!cleanTagline) {
        return `Discover ${title}, a standout read for curious minds.`;
    }
    return `Discover ${title}, a standout read for curious minds. ${cleanTagline}`;
}

function coverForTitle(title) {
    const key = String(title || "").toLowerCase();
    if (key.includes("midnight archive")) return "/images/midnight-archive.svg";
    if (key.includes("ink") && key.includes("ember")) return "/images/ink-ember.svg";
    if (key.includes("third coast")) return "/images/third-coast-essays.svg";
    if (key.includes("quiet hours")) return "/images/quiet-hours.svg";
    if (key.includes("comics") || key.includes("art")) return "/images/comics-art-sampler.svg";
    return "/images/default-book.svg";
}

function buildFeatured(spotlight, staffPicks) {
    const list = [];
    if (spotlight) list.push(spotlight);
    (staffPicks || []).forEach(item => {
        if (!item) return;
        if (item.id && list.some(existing => existing.id === item.id)) return;
        list.push(item);
    });
    return list.slice(0, 6);
}

function isSameText(a, b) {
    if (!a || !b) return false;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
