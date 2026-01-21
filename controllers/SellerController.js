const Book = require("../models/Book");
const User = require("../models/User");

module.exports = {
    booksPage: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const books = await Book.listBySeller(sellerId);
            res.render("seller-books", {
                books,
                selectedBook: null,
                error: null,
                success: null,
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Seller books page error", err);
            res.status(500).send("Failed to load books.");
        }
    },

    editBookPage: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const [books, selectedBook] = await Promise.all([
                Book.listBySeller(sellerId),
                Book.findByIdForSeller(req.params.id, sellerId)
            ]);
            if (!selectedBook) return res.status(404).send("Book not found.");
            res.render("seller-books", {
                books,
                selectedBook,
                error: null,
                success: null,
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Seller edit book page error", err);
            res.status(500).send("Failed to load book.");
        }
    },

    createBook: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const { title, author, price, genre } = req.body;
            const trimmedTitle = (title || "").trim();
            const trimmedAuthor = (author || "").trim();
            const normalizedPrice = Number(price);

            if (!trimmedTitle || !trimmedAuthor || !Number.isFinite(normalizedPrice)) {
                const books = await Book.listBySeller(sellerId);
                return res.render("seller-books", {
                    books,
                    selectedBook: null,
                    error: "Title, author, and a valid price are required.",
                    success: null,
                    user: req.session.user || null
                });
            }

            await Book.create({
                title: trimmedTitle,
                author: trimmedAuthor,
                price: normalizedPrice,
                genre: (genre || "").trim(),
                sellerId
            });
            const books = await Book.listBySeller(sellerId);
            res.render("seller-books", {
                books,
                selectedBook: null,
                error: null,
                success: "Book created.",
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Create book error", err);
            res.status(500).send("Failed to create book.");
        }
    },

    updateBook: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const { title, author, price, genre } = req.body;
            const trimmedTitle = (title || "").trim();
            const trimmedAuthor = (author || "").trim();
            const normalizedPrice = Number(price);
            const id = Number(req.params.id);

            if (!Number.isFinite(id)) return res.status(400).send("Invalid book id.");

            if (!trimmedTitle || !trimmedAuthor || !Number.isFinite(normalizedPrice)) {
                const [books, selectedBook] = await Promise.all([
                    Book.listBySeller(sellerId),
                    Book.findByIdForSeller(id, sellerId)
                ]);
                return res.render("seller-books", {
                    books,
                    selectedBook,
                    error: "Title, author, and a valid price are required.",
                    success: null,
                    user: req.session.user || null
                });
            }

            await Book.update({
                id,
                title: trimmedTitle,
                author: trimmedAuthor,
                price: normalizedPrice,
                genre: (genre || "").trim(),
                sellerId
            });
            const books = await Book.listBySeller(sellerId);
            res.render("seller-books", {
                books,
                selectedBook: null,
                error: null,
                success: "Book updated.",
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Update book error", err);
            res.status(500).send("Failed to update book.");
        }
    },

    deleteBook: async (req, res) => {
        try {
            const sellerId = req.session.user.id;
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).send("Invalid book id.");

            await Book.remove(id, sellerId);
            const books = await Book.listBySeller(sellerId);
            res.render("seller-books", {
                books,
                selectedBook: null,
                error: null,
                success: "Book deleted.",
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Delete book error", err);
            res.status(500).send("Failed to delete book.");
        }
    },

    publicProfile: async (req, res) => {
        try {
            const sellerId = Number(req.params.id);
            if (!Number.isFinite(sellerId)) return res.status(400).send("Invalid seller id.");

            const [seller, books] = await Promise.all([
                User.findSellerProfileById(sellerId),
                Book.listBySeller(sellerId)
            ]);

            if (!seller) return res.status(404).send("Seller not found.");

            const booksWithCovers = books.map(book => ({
                ...book,
                coverImage: coverForTitle(book.title)
            }));

            res.render("seller-profile", {
                seller,
                books: booksWithCovers,
                user: req.session.user || null
            });
        } catch (err) {
            console.error("Seller profile error", err);
            res.status(500).send("Failed to load seller.");
        }
    }
};

function coverForTitle(title) {
    const key = String(title || "").toLowerCase();
    if (key.includes("midnight archive")) return "/images/midnight-archive.svg";
    if (key.includes("ink") && key.includes("ember")) return "/images/ink-ember.svg";
    if (key.includes("third coast")) return "/images/third-coast-essays.svg";
    if (key.includes("quiet hours")) return "/images/quiet-hours.svg";
    if (key.includes("comics") || key.includes("art")) return "/images/comics-art-sampler.svg";
    return "/images/default-book.svg";
}
