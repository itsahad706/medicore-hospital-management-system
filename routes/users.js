// ── routes/users.js ───────────────────────────────────────────────
// Admin-only user account management (admin/receptionist/patient logins;
// doctor accounts are managed together with their profile under /doctors).
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { body, validationResult } = require("express-validator");
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

router.get("/", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [users] = await db.query("SELECT * FROM users ORDER BY role, name");
  res.render("users/list", { title: "Users", users });
});

router.get("/new", isLoggedIn, hasRole("admin"), (req, res) => {
  res.render("users/form", { title: "Add User", targetUser: {} });
});

router.post(
  "/", isLoggedIn, hasRole("admin"),
  [
    body("name").trim().notEmpty(),
    body("username").trim().notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("role").isIn(["admin", "receptionist", "patient"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", "Please check the form — a field is missing or invalid.");
      return res.redirect("/users/new");
    }
    try {
      const { name, username, email, password, role, phone } = req.body;
      const hash = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)",
        [name, username, email, hash, role, phone || null]
      );
      if (role === "patient") {
        await db.query(
          "INSERT INTO patients (user_id, mrn, name, gender) VALUES (?, ?, ?, 'other')",
          [result.insertId, `MRN-${String(result.insertId).padStart(6, "0")}`, name]
        );
      }
      await logActivity(db, req.session.user.id, "user_created", `Created user ${username} (${role})`, req.ip);
      req.flash("success", "User account created.");
      res.redirect("/users");
    } catch (err) {
      console.error(err);
      req.flash("error", "Failed to create user (username/email may already exist).");
      res.redirect("/users/new");
    }
  }
);

router.get("/:id/edit", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [[targetUser]] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!targetUser) { req.flash("error", "User not found."); return res.redirect("/users"); }
  res.render("users/form", { title: "Edit User", targetUser });
});

router.put("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, email, phone, status } = req.body;
  await db.query("UPDATE users SET name=?, email=?, phone=?, status=? WHERE id=?", [name, email, phone || null, status || "active", req.params.id]);
  req.flash("success", "User updated.");
  res.redirect("/users");
});

router.put("/:id/reset-password", isLoggedIn, hasRole("admin"), async (req, res) => {
  const tempPassword = Math.random().toString(36).slice(-8);
  const hash = await bcrypt.hash(tempPassword, 10);
  await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id]);
  req.flash("success", `Password reset. Temporary password: ${tempPassword}`);
  res.redirect("/users");
});

router.delete("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) {
    req.flash("error", "You cannot delete your own account.");
    return res.redirect("/users");
  }
  await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
  req.flash("success", "User account deleted.");
  res.redirect("/users");
});

module.exports = router;
