// ── routes/auth.js ────────────────────────────────────────────────
// Login / Logout / Change password.
// Accounts are created by an admin under /users (or via self-registration
// for patients through the portal), not via a public generic sign-up.

const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcrypt");
const { body, validationResult } = require("express-validator");

const db = require("../config/db");
const { isLoggedIn, isGuest } = require("../middleware/auth");
const { logActivity, nextSequence } = require("../utils/helpers");

router.get("/login", isGuest, (req, res) => {
  res.render("auth/login", { title: "Login" });
});

router.post(
  "/login",
  isGuest,
  [
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", errors.array()[0].msg);
      return res.redirect("/auth/login");
    }

    const { username, password } = req.body;

    try {
      const [rows] = await db.query(
        "SELECT * FROM users WHERE (username = ? OR email = ?) LIMIT 1",
        [username, username]
      );

      if (rows.length === 0) {
        req.flash("error", "Invalid username or password.");
        return res.redirect("/auth/login");
      }

      const user = rows[0];

      if (user.status !== "active") {
        req.flash("error", "This account has been deactivated. Contact your administrator.");
        return res.redirect("/auth/login");
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        req.flash("error", "Invalid username or password.");
        return res.redirect("/auth/login");
      }

      req.session.regenerate(async (err) => {
        if (err) {
          req.flash("error", "Login failed. Please try again.");
          return res.redirect("/auth/login");
        }

        req.session.user = {
          id: user.id, name: user.name, username: user.username,
          email: user.email, role: user.role,
        };

        await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
        await logActivity(db, user.id, "login", `${user.username} logged in`, req.ip);

        req.flash("success", `Welcome back, ${user.name}!`);
        res.redirect("/dashboard");
      });

    } catch (err) {
      console.error(err);
      req.flash("error", "Something went wrong. Please try again.");
      res.redirect("/auth/login");
    }
  }
);

router.delete("/logout", isLoggedIn, async (req, res) => {
  const user = req.session.user;
  await logActivity(db, user.id, "logout", `${user.username} logged out`, req.ip);
  req.session.destroy(() => {
    res.clearCookie("hms.sid");
    res.redirect("/auth/login");
  });
});

router.get("/change-password", isLoggedIn, (req, res) => {
  res.render("auth/change-password", { title: "Change Password" });
});

router.post(
  "/change-password",
  isLoggedIn,
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
    body("confirmPassword").custom((val, { req }) => val === req.body.newPassword)
      .withMessage("Passwords do not match"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", errors.array()[0].msg);
      return res.redirect("/auth/change-password");
    }

    try {
      const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [req.session.user.id]);
      const user = rows[0];

      const match = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!match) {
        req.flash("error", "Current password is incorrect.");
        return res.redirect("/auth/change-password");
      }

      const hash = await bcrypt.hash(req.body.newPassword, 10);
      await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, user.id]);
      await logActivity(db, user.id, "password_change", "Password changed", req.ip);

      req.flash("success", "Password updated successfully.");
      res.redirect("/dashboard");

    } catch (err) {
      console.error(err);
      req.flash("error", "Failed to update password.");
      res.redirect("/auth/change-password");
    }
  }
);

module.exports = router;
