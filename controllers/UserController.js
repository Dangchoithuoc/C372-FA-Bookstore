const User = require("../models/User");

// User controller now uses MySQL-backed User model (passwords stored in password_hash column).
module.exports = {
    loginPage: (req, res) => {
        res.render("login", { error: null });
    },

    registerPage: (req, res) => {
        res.render("register", { error: null });
    },

    register: async (req, res) => {
        try {
            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return res.render("register", { error: "All fields are required." });
            }
            const existing = await User.findByEmail(email);
            if (existing) {
                return res.render("register", { error: "Email already registered. Try logging in." });
            }
            const created = await User.create({ name, email, password });
            req.session.user = { id: created.id, name: created.name, email: created.email };
            res.redirect("/");
        } catch (err) {
            console.error("Register error", err);
            res.render("register", { error: "Could not register. Please try again." });
        }
    },

    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await User.findByEmail(email || "");
            if (!user || user.password_hash !== password) {
                return res.render("login", { error: "Invalid email or password." });
            }
            req.session.user = { id: user.id, name: user.name, email: user.email };
            res.redirect("/");
        } catch (err) {
            console.error("Login error", err);
            res.render("login", { error: "Could not log in. Please try again." });
        }
    },

    logout: (req, res) => {
        req.session.user = null;
        res.redirect("/");
    }
};
