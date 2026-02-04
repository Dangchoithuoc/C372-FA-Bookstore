const Book = require("../models/Book");
const pool = require("../db");

module.exports = {
    homePage: async (req, res) => {
        try {
            const { search, genre, priceRange, sortBy } = req.query;
            const user = req.session.user;
            
            // Debug logging
            console.log("Filter params:", { search, genre, priceRange, sortBy });
            console.log("User info:", user ? { id: user.id, role: user.role } : "No user");
            
            const [spotlight, staffPicks, filteredBooks] = await Promise.all([
                Book.getFeatured(),
                Book.getStaffPicks(3),
                Book.getFilteredBooks({ 
                    search, 
                    genre, 
                    priceRange, 
                    sortBy,
                    currentUserId: user ? user.id : null,
                    userRole: user ? user.role : 'guest'
                })
            ]);

            console.log("Filtered books count:", filteredBooks ? filteredBooks.length : 0);
            
            const resolvedSpotlight = normalizeSpotlight(spotlight) || normalizeSpotlight({
                title: "The Midnight Archive",
                author: "Clara Wren",
                tagline: "A bookshop mystery soaked in moonlight and old paper",
                description: "Follow archivist Elise Calder as she uncovers a century-old disappearance beneath the city's forgotten stacks.",
                price: 24.0,
                badge: "New Arrival",
                coverImage: "/images/midnight-archive.svg"
            });

            const resolvedStaff = normalizeStaff(staffPicks) || normalizeStaff([
                { title: "Ink & Ember", author: "Ravi Iyer", price: 19.5, vibe: "Atmospheric fantasy", badge: "Staff pick", coverImage: "/images/ink-ember.svg" },
                { title: "Third Coast Essays", author: "Mae Lin", price: 17.0, vibe: "Sharp non-fiction", badge: "Essay", coverImage: "/images/third-coast-essays.svg" },
                { title: "Quiet Hours", author: "Nadia Bloom", price: 15.2, vibe: "Slow-burn romance", badge: "Comfort", coverImage: "/images/quiet-hours.svg" }
            ]);

            // Get seller's books if user is a seller
            let sellerBooks = [];
            if (user && user.role === 'seller') {
                const [books] = await pool.execute(
                    "SELECT * FROM books WHERE seller_id = ? ORDER BY book_id DESC LIMIT 5",
                    [user.id]
                );
                sellerBooks = books;
                console.log("Seller books found:", sellerBooks.length);
            }

            res.render("home", {
                spotlight: resolvedSpotlight,
                staffPicks: resolvedStaff,
                filteredBooks: filteredBooks,
                searchQuery: search || '',
                genre: genre || '',
                priceRange: priceRange || '',
                sortBy: sortBy || 'title_asc',
                user: user || null,
                sellerBooks: sellerBooks
            });
        } catch (err) {
            console.error("Error loading homepage:", err);
            res.status(500).send("Failed to load homepage");
        }
    }
};

// Helper functions
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
        coverImage: item.coverImage || "/images/default-book.svg"
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
        coverImage: b.coverImage || "/images/default-book.svg"
    }));
}
