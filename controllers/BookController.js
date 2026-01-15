const Book = require("../models/Book");

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

            res.render("home", {
                spotlight: resolvedSpotlight,
                staffPicks: resolvedStaff,
                shelves: resolvedShelves,
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
        price: normalizePrice(b.price),
        vibe: b.vibe,
        badge: b.badge || "Staff pick",
        coverImage: coverForTitle(b.title)
    }));
}

function normalizeDetail(item) {
    if (!item) return null;
    const tagline = item.tagline || item.vibe || item.genre || "A fresh story for your shelf.";
    return {
        id: item.id,
        title: item.title,
        author: item.author,
        genre: item.genre || item.vibe || "",
        price: normalizePrice(item.price),
        tagline,
        description: buildDescription(item.title, tagline),
        coverImage: coverForTitle(item.title)
    };
}

function buildDescription(title, tagline) {
    return `Discover ${title}, a standout read for curious minds. ${tagline}`;
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
