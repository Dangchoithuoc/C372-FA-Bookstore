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
                shelves: resolvedShelves
            });
        } catch (err) {
            console.error("Error loading homepage:", err);
            res.status(500).send("Failed to load homepage");
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
        title: item.title,
        author: item.author,
        tagline: item.tagline,
        description: item.description || item.tagline || "",
        price: normalizePrice(item.price),
        badge: item.badge || "New Arrival"
    };
}

function normalizeStaff(list) {
    if (!list || list.length === 0) return null;
    return list.map(b => ({
        title: b.title,
        author: b.author,
        price: normalizePrice(b.price),
        vibe: b.vibe,
        badge: b.badge || "Staff pick"
    }));
}
