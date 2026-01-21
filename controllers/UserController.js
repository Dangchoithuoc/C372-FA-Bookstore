const User = require("../models/User");

// User controller now uses MySQL-backed User model (passwords stored in user_password column).
module.exports = {
    loginPage: (req, res) => {
        res.render("login", { error: null });
    },

    registerPage: (req, res) => {
        res.render("register", { error: null });
    },

    register: async (req, res) => {
        try {
            const { name, email, password, role, contact_number, address } = req.body;
            if (!name || !email || !password || !role) {
                return res.render("register", { error: "All fields are required." });
            }
            const normalizedRole = role === "seller" ? "seller" : "buyer";
            const existing = await User.findByEmail(email);
            if (existing) {
                return res.render("register", { error: "Email already registered. Try logging in." });
            }
            const created = await User.create({
                name,
                email,
                password,
                role: normalizedRole,
                contactNumber: (contact_number || "").trim(),
                address: (address || "").trim()
            });
            req.session.user = { id: created.id, name: created.name, email: created.email, role: created.role || "buyer" };
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
            if (!user || user.password_hash !== hashPassword(password || "")) {
                return res.render("login", { error: "Invalid email or password." });
            }
            req.session.user = { id: user.id, name: user.username, email: user.email, role: user.role || "buyer" };
            res.redirect("/");
        } catch (err) {
            console.error("Login error", err);
            res.render("login", { error: "Could not log in. Please try again." });
        }
    },

    logout: (req, res) => {
        req.session.user = null;
        res.redirect("/");
    },

    profilePage: async (req, res) => {
        try {
            const sessionUser = req.session.user;
            if (!sessionUser) return res.redirect("/login");
            if (!isBuyerOrSeller(sessionUser)) return res.status(403).send("Access denied.");

            const user = await User.findById(sessionUser.id);
            if (!user) return res.status(404).send("User not found.");

            res.render("profile", { user, error: null, success: null });
        } catch (err) {
            console.error("Profile page error", err);
            res.status(500).send("Failed to load profile.");
        }
    },

    updateProfile: async (req, res) => {
        try {
            const sessionUser = req.session.user;
            if (!sessionUser) return res.redirect("/login");
            if (!isBuyerOrSeller(sessionUser)) return res.status(403).send("Access denied.");

            const { name, email, contact_number, address, password } = req.body;
            if (!name || !email) {
                const user = await User.findById(sessionUser.id);
                return res.render("profile", { user, error: "Name and email are required.", success: null });
            }

            const existing = await User.findByEmail(email);
            if (existing && existing.id !== sessionUser.id) {
                const user = await User.findById(sessionUser.id);
                return res.render("profile", { user, error: "Email already in use.", success: null });
            }

            const updated = await User.updateProfile({
                id: sessionUser.id,
                username: name.trim(),
                email: email.trim(),
                contactNumber: (contact_number || "").trim(),
                address: (address || "").trim(),
                password: password && password.trim() ? password.trim() : null
            });

            req.session.user = {
                ...sessionUser,
                name: updated.username,
                email: updated.email
            };

            const user = await User.findById(sessionUser.id);
            res.render("profile", { user, error: null, success: "Profile updated." });
        } catch (err) {
            console.error("Update profile error", err);
            res.status(500).send("Failed to update profile.");
        }
    }
};

function isBuyerOrSeller(user) {
    return user && (user.role === "buyer" || user.role === "seller");
}

function isAdmin(user) {
    return user && user.role === "admin";
}

function hashPassword(password) {
    const crypto = require("crypto");
    return crypto.createHash("sha1").update(password).digest("hex");
}

module.exports.adminUsersPage = async (req, res) => {
    try {
        if (!isAdmin(req.session.user)) return res.status(403).send("Access denied.");
        const users = await User.listAll();
        res.render("edituser", { users, sessionUser: req.session.user, selectedUser: null, error: null, success: null });
    } catch (err) {
        console.error("Admin users page error", err);
        res.status(500).send("Failed to load users.");
    }
};

module.exports.adminEditUserPage = async (req, res) => {
    try {
        if (!isAdmin(req.session.user)) return res.status(403).send("Access denied.");
        const [users, selectedUser] = await Promise.all([
            User.listAll(),
            User.findById(req.params.id)
        ]);
        if (!selectedUser) return res.status(404).send("User not found.");
        res.render("edituser", { users, sessionUser: req.session.user, selectedUser, error: null, success: null });
    } catch (err) {
        console.error("Admin edit user page error", err);
        res.status(500).send("Failed to load user.");
    }
};

module.exports.adminUpdateUser = async (req, res) => {
    try {
        if (!isAdmin(req.session.user)) return res.status(403).send("Access denied.");
        const { name, email, contact_number, address, role, password } = req.body;
        const userId = Number(req.params.id);
        const current = await User.findById(userId);
        if (!current) return res.status(404).send("User not found.");

        if (!name || !email || !role) {
            const users = await User.listAll();
            return res.render("edituser", { users, sessionUser: req.session.user, selectedUser: current, error: "Name, email, and role are required.", success: null });
        }

        const existing = await User.findByEmail(email);
        if (existing && existing.id !== userId) {
            const users = await User.listAll();
            return res.render("edituser", { users, sessionUser: req.session.user, selectedUser: current, error: "Email already in use.", success: null });
        }

        const updated = await User.updateByAdmin({
            id: userId,
            username: name.trim(),
            email: email.trim(),
            contactNumber: (contact_number || "").trim(),
            address: (address || "").trim(),
            role: role.trim(),
            password: password && password.trim() ? password.trim() : null
        });

        const [users, refreshed] = await Promise.all([
            User.listAll(),
            User.findById(userId)
        ]);
        res.render("edituser", { users, sessionUser: req.session.user, selectedUser: refreshed || updated, error: null, success: "User updated." });
    } catch (err) {
        console.error("Admin update user error", err);
        res.status(500).send("Failed to update user.");
    }
};
