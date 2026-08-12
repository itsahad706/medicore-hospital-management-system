// ── routes/departments.js ─────────────────────────────────────────
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");

router.get("/", isLoggedIn, hasRole("admin", "doctor", "receptionist"), async (req, res) => {
  const [departments] = await db.query(
    `SELECT dep.*, COUNT(doc.id) AS doctor_count FROM departments dep
     LEFT JOIN doctors doc ON doc.department_id = dep.id
     GROUP BY dep.id ORDER BY dep.name`);
  res.render("departments/list", { title: "Departments", departments });
});

router.post("/", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, description } = req.body;
  try {
    await db.query("INSERT INTO departments (name, description) VALUES (?, ?)", [name, description || null]);
    req.flash("success", "Department added.");
  } catch (err) {
    req.flash("error", "Could not add department (name may already exist).");
  }
  res.redirect("/departments");
});

router.put("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, description } = req.body;
  await db.query("UPDATE departments SET name=?, description=? WHERE id=?", [name, description || null, req.params.id]);
  req.flash("success", "Department updated.");
  res.redirect("/departments");
});

router.delete("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM departments WHERE id = ?", [req.params.id]);
  req.flash("success", "Department deleted.");
  res.redirect("/departments");
});

module.exports = router;
