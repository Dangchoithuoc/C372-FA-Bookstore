const Membership = require("../models/Membership");

module.exports = {
    dashboard: async (req, res) => {
        try {
            const data = await Membership.getMembership(req.session.user.id);
            res.render("membership", {
                user: req.session.user,
                membership: data
            });
        } catch (err) {
            console.error("Membership dashboard error:", err);
            res.status(500).send("Could not load membership");
        }
    }
};
