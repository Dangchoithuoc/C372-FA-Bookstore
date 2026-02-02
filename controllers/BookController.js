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
            
            const [spotlight, staffPicks, shelves, filteredBooks] = await Promise.all([
                Book.getFeatured(),
                Book.getStaffPicks(6),
                Book.getShelves(),
                (search || genre || priceRange || sortBy) ? 
                    Book.getFilteredBooks({ 
                        search, 
                        genre, 
                        priceRange, 
                        sortBy,
                        currentUserId: user ? user.id : null,
                        userRole: user ? user.role : 'guest'
                    }) : 
                    Promise.resolve(null)
            ]);

            console.log("Filtered books count:", filteredBooks ? filteredBooks.length : 0);
            
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
                shelves: resolvedShelves,
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