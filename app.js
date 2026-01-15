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
const { requireLogin, requireCartItems } = require("./middleware/auth");

// Homepage
app.get("/", BookController.homePage);
app.get("/books/:id", BookController.bookDetails);

// Auth routes
app.get("/login", UserController.loginPage);
app.post("/login", UserController.login);
app.get("/register", UserController.registerPage);
app.post("/register", UserController.register);
app.get("/logout", UserController.logout);
app.get("/profile", requireLogin, UserController.profilePage);
app.post("/profile", requireLogin, UserController.updateProfile);

// Admin routes
app.get("/admin/users", requireLogin, UserController.adminUsersPage);
app.get("/admin/users/:id", requireLogin, UserController.adminEditUserPage);
app.post("/admin/users/:id", requireLogin, UserController.adminUpdateUser);

// Cart routes (login required)
app.get("/cart", requireLogin, CartController.viewCart);
app.post("/cart/add", requireLogin, CartController.addItem);
app.post("/cart/update", requireLogin, CartController.updateItem);
app.post("/cart/remove", requireLogin, CartController.removeItem);
app.post("/cart/clear", requireLogin, CartController.clearCart);

// Checkout routes (login + cart required)
app.get("/checkout", requireLogin, requireCartItems, CheckoutController.checkoutPage);
app.post("/checkout/pay", requireLogin, requireCartItems, CheckoutController.processPayment);

// Server listening at bottom
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
