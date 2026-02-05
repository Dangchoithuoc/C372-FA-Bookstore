require('dotenv').config();
const User = require("../models/User");
const bcrypt = require('bcrypt');

module.exports = {
    loginPage: (req, res) => {
        res.render("login", { error: null });
    },

    profilePage: async (req, res) => {
        try {
            const sessionUser = req.session.user;
            const user = await User.findById(sessionUser.id);
            if (!user) {
                return res.redirect("/logout");
            }
            res.render("profile", {
                user: { ...user, role: sessionUser.role },
                error: null,
                success: null
            });
        } catch (err) {
            console.error("Profile load error:", err);
            res.status(500).send("Could not load profile");
        }
    },

    updateProfile: async (req, res) => {
        try {
            const sessionUser = req.session.user;
            const { name, email, contact_number, address, password } = req.body || {};

            if (!name || !email) {
                return res.render("profile", {
                    user: { ...sessionUser, username: name || sessionUser.name, email: email || sessionUser.email, contact_number, address },
                    error: "Name and email are required.",
                    success: null
                });
            }

            const emailTaken = await User.emailInUse(email, sessionUser.id);
            if (emailTaken) {
                return res.render("profile", {
                    user: { ...sessionUser, username: name, email, contact_number, address },
                    error: "Email is already in use.",
                    success: null
                });
            }

            await User.updateProfile(sessionUser.id, { name, email, contact_number, address, password });

            // refresh session data
            req.session.user.name = name;
            req.session.user.email = email.toLowerCase();

            const updated = await User.findById(sessionUser.id);
            res.render("profile", {
                user: { ...updated, role: sessionUser.role },
                error: null,
                success: "Profile updated successfully."
            });
        } catch (err) {
            console.error("Profile update error:", err);
            res.status(500).send("Could not update profile");
        }
    },

    registerPage: (req, res) => {
        res.render("register", { 
            error: null,
            name: '',
            email: '',
            role: 'buyer'
        });
    },

    register: async (req, res) => {
        try {
            const { name, email, password, role, inviteCode } = req.body;
            
            console.log("=== REGISTRATION DEBUG ===");
            console.log("Form data:", { name, email, role, inviteCode });
            console.log("Environment codes:", {
                buyer: process.env.BUYER_INVITE_CODE,
                seller: process.env.SELLER_INVITE_CODE,
                admin: process.env.ADMIN_INVITE_CODE
            });
            
            if (!name || !email || !password || !role || !inviteCode) {
                console.log("Missing fields");
                return res.render("register", { 
                    error: "All fields are required.",
                    name: name || '', 
                    email: email || '',
                    role: role || 'buyer'
                });
            }
            
            // Define invitation codes for each role
            const roleCodes = {
                'buyer': process.env.BUYER_INVITE_CODE || 'BUYER123',
                'seller': process.env.SELLER_INVITE_CODE || 'SELLER123',
                'admin': process.env.ADMIN_INVITE_CODE || 'ADMIN123'
            };
            
            console.log("Expected code for role", role, ":", roleCodes[role]);
            console.log("User entered code:", inviteCode);
            
            // Validate invitation code for selected role
            const validCode = roleCodes[role];
            if (!validCode) {
                console.log("No code defined for role:", role);
                return res.render("register", { 
                    error: `Registration for ${role} role is not available.`,
                    name: name || '', 
                    email: email || '',
                    role: 'buyer'
                });
            }
            
            if (inviteCode !== validCode) {
                console.log("Code mismatch! Expected:", validCode, "Got:", inviteCode);
                return res.render("register", { 
                    error: `Invalid ${role} invitation code. Expected: ${validCode}`,
                    name: name || '', 
                    email: email || '',
                    role: role || 'buyer'
                });
            }
            
            // Validate role
            const validRoles = ['buyer', 'seller', 'admin'];
            if (!validRoles.includes(role)) {
                return res.render("register", { 
                    error: "Invalid account type selected.",
                    name: name || '', 
                    email: email || '',
                    role: 'buyer'
                });
            }
            
            const existing = await User.findByEmail(email);
            if (existing) {
                return res.render("register", { 
                    error: "Email already registered. Try logging in.",
                    name: name || '', 
                    email: email || '',
                    role: role || 'buyer'
                });
            }
            
            console.log("Creating user with role:", role);
            const created = await User.create({ name, email, password, role });
            
            req.session.user = { 
                id: created.id, 
                name: created.name, 
                email: created.email, 
                role: created.role 
            };
            
            console.log("✓ Registration successful for:", created.email, "Role:", created.role);
            res.redirect("/");
            
        } catch (err) {
            console.error("✗ Register error:", err);
            res.render("register", { 
                error: "Could not register. Please try again.",
                name: req.body.name || '',
                email: req.body.email || '',
                role: req.body.role || 'buyer'
            });
        }
    },

    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            
            if (!email || !password) {
                return res.render("login", { error: "Email and password are required." });
            }
            
            // Find user
            const user = await User.findByEmail(email);
            
            if (!user) {
                return res.render("login", { error: "Invalid email or password." });
            }

            if (user.disabled) {
                return res.render("login", { error: "Your account has been disabled. Please contact admin." });
            }
            
            // Handle both plain and hashed passwords during transition
            let passwordMatch = false;
            
            // First check if password matches plain text (for existing users)
            if (password === user.user_password) {
                passwordMatch = true;
            } 
            // Otherwise check if it's a hashed password
            else if (await bcrypt.compare(password, user.user_password)) {
                passwordMatch = true;
            }
            
            if (!passwordMatch) {
                return res.render("login", { error: "Invalid email or password." });
            }
            
            // Set session
            req.session.user = { 
                id: user.id, 
                name: user.username, 
                email: user.email, 
                role: user.role || "buyer" 
            };
            
            res.redirect("/");
        } catch (err) {
            console.error("Login error:", err);
            res.render("login", { error: "Could not log in. Please try again." });
        }
    },

    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error("Logout error:", err);
            }
            res.redirect("/");
        });
    }
};
