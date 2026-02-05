const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

const bookUploadsDir = path.join(__dirname, "public", "uploads", "books");
fs.mkdirSync(bookUploadsDir, { recursive: true });

const allowedBookImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const bookImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, bookUploadsDir),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-");
        cb(null, `${Date.now()}-${safeName}`);
    }
});
const uploadBookImage = multer({
    storage: bookImageStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!allowedBookImageTypes.includes(file.mimetype)) {
            req.fileValidationError = "Only JPEG, PNG, GIF, or WEBP images are allowed.";
            return cb(null, false);
        }
        cb(null, true);
    }
});

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static assets
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions enabled
app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

const CheckoutController = require("./controllers/CheckoutController");
const BookController = require("./controllers/BookController");
const UserController = require("./controllers/UserController");
const CartController = require("./controllers/CartController");
const SellerController = require("./controllers/SellerController"); // NEW
const AdminController = require("./controllers/AdminController"); // NEW
const PaypalController = require("./controllers/PaypalController");
const NetsController = require("./controllers/NetsController");
const OrderController = require("./controllers/OrderController");
const CartModel = require("./models/Cart");

// Cart count for nav badges
app.use(async (req, res, next) => {
    res.locals.cartCount = 0;
    if (!req.session.user || req.session.user.role !== "buyer") {
        return next();
    }
    try {
        const { items } = await CartModel.getCart(req.session.user.id);
        res.locals.cartCount = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    } catch (err) {
        console.error("Cart count error", err);
    }
    next();
});

// Middleware to require login
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

// Middleware to require seller role
function requireSeller(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'seller') {
        return res.redirect("/");
    }
    next();
}

// Middleware to require buyer role
function requireBuyer(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'buyer') {
        return res.redirect("/");
    }
    next();
}

// Add admin middleware
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect("/");
    }
    next();
}

// Middleware to require items in cart before checkout
async function requireCartItems(req, res, next) {
    try {
        const userId = req.session.user && req.session.user.id;
        if (!userId) return res.redirect("/login");
        const { items } = await CartModel.getCart(userId);
        if (!items || !items.length) {
            return res.redirect("/cart");
        }
        next();
    } catch (err) {
        console.error("Cart check error", err);
        res.redirect("/cart");
    }
}

// Homepage (shows different UI based on role)
app.get("/", BookController.homePage);

// Auth routes
app.get("/login", UserController.loginPage);
app.post("/login", UserController.login);
app.get("/register", UserController.registerPage);
app.post("/register", UserController.register);
app.get("/logout", UserController.logout);
app.get("/profile", requireLogin, UserController.profilePage);
app.post("/profile", requireLogin, UserController.updateProfile);

// Cart routes (login required)
app.get("/cart", requireLogin, CartController.viewCart);
app.post("/cart/add", requireLogin, CartController.addItem);
app.post("/cart/update", requireLogin, CartController.updateItem);
app.post("/cart/remove", requireLogin, CartController.removeItem);
app.post("/cart/clear", requireLogin, CartController.clearCart);

// Checkout routes (login + cart required)
app.get("/checkout", requireLogin, requireCartItems, CheckoutController.checkoutPage);

// save checkout details before payment
app.post("/checkout/save-details", requireLogin, requireCartItems, CheckoutController.saveCheckoutDetails);

// PayLah (simulate later)
app.post("/checkout/paylah", requireLogin, requireCartItems, CheckoutController.payLah);
// Skip payment (testing)
app.post("/checkout/skip", requireLogin, requireCartItems, CheckoutController.skipPayment);

// PayPal flow 
app.get("/checkout/paypal", requireLogin, requireCartItems, PaypalController.paypalPage);
app.post("/api/paypal/create-order", requireLogin, requireCartItems, PaypalController.createOrder);
app.post("/api/paypal/capture-order", requireLogin, PaypalController.captureOrder);

// NETS flow 
app.get("/checkout/nets", requireLogin, requireCartItems, NetsController.generateQrCode);
app.get("/sse/payment-status/:txnRetrievalRef", requireLogin, NetsController.streamPaymentStatus);
app.get("/api/nets/payment-status/:txnRetrievalRef", requireLogin, NetsController.getStatus);
app.get("/nets-qr/success", requireLogin, NetsController.showSuccess);
app.get("/nets-qr/fail", requireLogin, NetsController.showFail);


// Orders (role-aware)
app.get("/orders", requireLogin, OrderController.purchaseHistory);
app.get("/invoice/:id", requireLogin, requireBuyer, OrderController.invoicePage);
app.post("/orders/items/:id/delivery", requireLogin, requireSeller, OrderController.updateDeliveryStatus);

// NEW: Seller CRUD routes (login + seller role required)
app.get("/seller/dashboard", requireLogin, requireSeller, SellerController.dashboard);
app.get("/seller/books", requireLogin, requireSeller, SellerController.listBooks);
app.get("/seller/books/new", requireLogin, requireSeller, SellerController.newBookPage);
app.post("/seller/books", requireLogin, requireSeller, uploadBookImage.single("image"), SellerController.createBook);
app.get("/seller/books/:id/edit", requireLogin, requireSeller, SellerController.editBookPage);
app.post("/seller/books/:id/update", requireLogin, requireSeller, uploadBookImage.single("image"), SellerController.updateBook);
app.post("/seller/books/:id/delete", requireLogin, requireSeller, SellerController.deleteBook);


// Admin routes
app.get("/admin/dashboard", requireLogin, requireAdmin, AdminController.dashboard);
app.get("/admin/users", requireLogin, requireAdmin, AdminController.listUsers);
app.get("/admin/books", requireLogin, requireAdmin, AdminController.listAllBooks);
app.get("/admin/charts", requireLogin, requireAdmin, AdminController.chartsPage);
app.get("/admin/reports/sales", requireLogin, requireAdmin, AdminController.salesReport);
app.get("/admin/orders", requireLogin, requireAdmin, OrderController.purchaseHistory);
app.post("/admin/users/:id/delete", requireLogin, requireAdmin, AdminController.deleteUser);
app.post("/admin/users/:id/disable", requireLogin, requireAdmin, AdminController.toggleUserDisabled);
app.post("/admin/books/:id/delete", requireLogin, requireAdmin, AdminController.deleteBook);

// Server listening at bottom
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
