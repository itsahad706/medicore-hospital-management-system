// ── routes/doctors.js ─────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { body, validationResult } = require("express-validator");
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

router.get("/", isLoggedIn, hasRole("admin", "doctor", "receptionist"), async (req, res) => {
  const [doctors] = await db.query(
    `SELECT doc.*, u.name, u.email, u.phone, u.status AS user_status, dep.name AS department_name
     FROM doctors doc JOIN users u ON doc.user_id = u.id
     LEFT JOIN departments dep ON doc.department_id = dep.id
     ORDER BY u.name`);
  res.render("doctors/list", { title: "Doctors", doctors });
});

router.get("/new", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [departments] = await db.query("SELECT * FROM departments ORDER BY name");
  res.render("doctors/form", { title: "Add Doctor", doctor: {}, user: {}, departments });
});

router.post(
  "/",
  isLoggedIn, hasRole("admin"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", errors.array()[0].msg);
      return res.redirect("/doctors/new");
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const { name, username, email, password, phone, department_id, specialization, qualification, consultation_fee, schedule_days, schedule_start, schedule_end } = req.body;
      const hash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'doctor', ?)",
        [name, username, email, hash, phone || null]
      );
      await conn.query(
        `INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee, schedule_days, schedule_start, schedule_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userResult.insertId, department_id || null, specialization || null, qualification || null,
         consultation_fee || 0, schedule_days || "Mon,Tue,Wed,Thu,Fri", schedule_start || "09:00", schedule_end || "17:00"]
      );
      await conn.commit();
      await logActivity(db, req.session.user.id, "doctor_created", `Added doctor ${name}`, req.ip);
      req.flash("success", "Doctor added successfully.");
      res.redirect("/doctors");
    } catch (err) {
      await conn.rollback();
      console.error(err);
      req.flash("error", "Failed to add doctor (username/email may already exist).");
      res.redirect("/doctors/new");
    } finally {
      conn.release();
    }
  }
);

router.get("/:id", isLoggedIn, hasRole("admin", "doctor", "receptionist"), async (req, res) => {
  const [[doctor]] = await db.query(
    `SELECT doc.*, u.name, u.email, u.phone FROM doctors doc JOIN users u ON doc.user_id = u.id WHERE doc.id = ?`,
    [req.params.id]);
  if (!doctor) { req.flash("error", "Doctor not found."); return res.redirect("/doctors"); }
  const [appointments] = await db.query(
    `SELECT a.*, p.name AS patient_name FROM appointments a JOIN patients p ON a.patient_id = p.id
     WHERE a.doctor_id = ? ORDER BY a.appointment_date DESC LIMIT 20`, [doctor.id]);
  res.render("doctors/view", { title: "Dr. " + doctor.name, doctor, appointments });
});

router.get("/:id/edit", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [[doctor]] = await db.query(
    `SELECT doc.*, u.name, u.email, u.phone, u.status AS user_status FROM doctors doc JOIN users u ON doc.user_id = u.id WHERE doc.id = ?`,
    [req.params.id]);
  if (!doctor) { req.flash("error", "Doctor not found."); return res.redirect("/doctors"); }
  const [departments] = await db.query("SELECT * FROM departments ORDER BY name");
  res.render("doctors/form", { title: "Edit Doctor", doctor, user: doctor, departments });
});

router.put("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, email, phone, department_id, specialization, qualification, consultation_fee, schedule_days, schedule_start, schedule_end, status } = req.body;
  const [[doctor]] = await db.query("SELECT * FROM doctors WHERE id = ?", [req.params.id]);
  if (!doctor) { req.flash("error", "Doctor not found."); return res.redirect("/doctors"); }

  await db.query("UPDATE users SET name=?, email=?, phone=?, status=? WHERE id=?",
    [name, email, phone || null, status || "active", doctor.user_id]);
  await db.query(
    `UPDATE doctors SET department_id=?, specialization=?, qualification=?, consultation_fee=?, schedule_days=?, schedule_start=?, schedule_end=?, status=?
     WHERE id=?`,
    [department_id || null, specialization || null, qualification || null, consultation_fee || 0,
     schedule_days || "Mon,Tue,Wed,Thu,Fri", schedule_start || "09:00", schedule_end || "17:00", status || "active", req.params.id]
  );
  req.flash("success", "Doctor updated.");
  res.redirect("/doctors/" + req.params.id);
});

router.delete("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [[doctor]] = await db.query("SELECT * FROM doctors WHERE id = ?", [req.params.id]);
  if (doctor) await db.query("DELETE FROM users WHERE id = ?", [doctor.user_id]); // cascades to doctors row
  req.flash("success", "Doctor removed.");
  res.redirect("/doctors");
});

module.exports = router;
