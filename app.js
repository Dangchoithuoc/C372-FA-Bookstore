const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

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
const CartModel = require("./models/Cart");

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

// Cart routes (login required)
app.get("/cart", requireLogin, CartController.viewCart);
app.post("/cart/add", requireLogin, CartController.addItem);
app.post("/cart/update", requireLogin, CartController.updateItem);
app.post("/cart/remove", requireLogin, CartController.removeItem);
app.post("/cart/clear", requireLogin, CartController.clearCart);

// Checkout routes (login + cart required)
app.get("/checkout", requireLogin, requireCartItems, CheckoutController.checkoutPage);
app.post("/checkout/pay", requireLogin, requireCartItems, CheckoutController.processPayment);

// NEW: Seller CRUD routes (login + seller role required)
app.get("/seller/dashboard", requireLogin, requireSeller, SellerController.dashboard);
app.get("/seller/books", requireLogin, requireSeller, SellerController.listBooks);
app.get("/seller/books/new", requireLogin, requireSeller, SellerController.newBookPage);
app.post("/seller/books", requireLogin, requireSeller, SellerController.createBook);
app.get("/seller/books/:id/edit", requireLogin, requireSeller, SellerController.editBookPage);
app.post("/seller/books/:id/update", requireLogin, requireSeller, SellerController.updateBook);
app.post("/seller/books/:id/delete", requireLogin, requireSeller, SellerController.deleteBook);


// Admin routes
app.get("/admin/dashboard", requireLogin, requireAdmin, AdminController.dashboard);
app.get("/admin/users", requireLogin, requireAdmin, AdminController.listUsers);
app.get("/admin/books", requireLogin, requireAdmin, AdminController.listAllBooks);
app.post("/admin/users/:id/delete", requireLogin, requireAdmin, AdminController.deleteUser);
app.post("/admin/books/:id/delete", requireLogin, requireAdmin, AdminController.deleteBook);

// Server listening at bottom
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});