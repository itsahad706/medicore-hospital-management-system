// ── routes/patients.js ────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { body, validationResult } = require("express-validator");
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { nextSequence, calcAge, logActivity } = require("../utils/helpers");

// ── LIST ──────────────────────────────────────────────────────────
router.get("/", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  let sql = "SELECT * FROM patients WHERE 1=1";
  const params = [];
  if (q) { sql += " AND (name LIKE ? OR mrn LIKE ? OR phone LIKE ?)"; params.push(q, q, q); }
  sql += " ORDER BY id DESC LIMIT 200";
  const [patients] = await db.query(sql, params);
  res.render("patients/list", { title: "Patients", patients, q: req.query.q || "", calcAge });
});

// ── NEW ───────────────────────────────────────────────────────────
router.get("/new", isLoggedIn, hasRole("admin", "receptionist"), (req, res) => {
  res.render("patients/form", { title: "New Patient", patient: {} });
});

router.post(
  "/",
  isLoggedIn, hasRole("admin", "receptionist"),
  [body("name").trim().notEmpty().withMessage("Name is required"), body("gender").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", errors.array()[0].msg);
      return res.redirect("/patients/new");
    }
    try {
      const mrn = await nextSequence(db, "patients", "mrn", "MRN-");
      const { name, dob, gender, blood_group, phone, email, address, emergency_contact, allergies, create_login } = req.body;

      let userId = null;
      if (create_login === "on" && email) {
        const tempPassword = Math.random().toString(36).slice(-8);
        const hash = await bcrypt.hash(tempPassword, 10);
        const username = email.split("@")[0] + Math.floor(Math.random() * 1000);
        const [userResult] = await db.query(
          "INSERT INTO users (name, username, email, password, role) VALUES (?, ?, ?, ?, 'patient')",
          [name, username, email, hash]
        );
        userId = userResult.insertId;
        req.flash("success", `Patient portal login created — username: ${username}, temp password: ${tempPassword}`);
      }

      await db.query(
        `INSERT INTO patients (user_id, mrn, name, dob, gender, blood_group, phone, email, address, emergency_contact, allergies)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, mrn, name, dob || null, gender, blood_group || null, phone || null, email || null, address || null, emergency_contact || null, allergies || null]
      );
      await logActivity(db, req.session.user.id, "patient_created", `Registered patient ${name} (${mrn})`, req.ip);
      req.flash("success", `Patient registered — MRN: ${mrn}`);
      res.redirect("/patients");
    } catch (err) {
      console.error(err);
      req.flash("error", "Failed to register patient.");
      res.redirect("/patients/new");
    }
  }
);

// ── VIEW (profile + history) ─────────────────────────────────────
router.get("/:id", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [[patient]] = await db.query("SELECT * FROM patients WHERE id = ?", [req.params.id]);
  if (!patient) { req.flash("error", "Patient not found."); return res.redirect("/patients"); }

  const [appointments] = await db.query(
    `SELECT a.*, u.name AS doctor_name FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE a.patient_id = ? ORDER BY a.appointment_date DESC LIMIT 20`, [patient.id]);
  const [admissions] = await db.query(
    `SELECT ad.*, w.name AS ward_name, b.bed_number FROM admissions ad
     JOIN beds b ON ad.bed_id = b.id JOIN wards w ON b.ward_id = w.id
     WHERE ad.patient_id = ? ORDER BY ad.admission_date DESC LIMIT 10`, [patient.id]);
  const [prescriptions] = await db.query(
    `SELECT pr.*, u.name AS doctor_name FROM prescriptions pr
     JOIN doctors d ON pr.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE pr.patient_id = ? ORDER BY pr.created_at DESC LIMIT 10`, [patient.id]);
  const [invoices] = await db.query(
    "SELECT * FROM invoices WHERE patient_id = ? ORDER BY invoice_date DESC LIMIT 10", [patient.id]);

  res.render("patients/view", { title: patient.name, patient, appointments, admissions, prescriptions, invoices, calcAge });
});

// ── EDIT ──────────────────────────────────────────────────────────
router.get("/:id/edit", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [[patient]] = await db.query("SELECT * FROM patients WHERE id = ?", [req.params.id]);
  if (!patient) { req.flash("error", "Patient not found."); return res.redirect("/patients"); }
  res.render("patients/form", { title: "Edit Patient", patient });
});

router.put("/:id", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const { name, dob, gender, blood_group, phone, email, address, emergency_contact, allergies, status } = req.body;
  await db.query(
    `UPDATE patients SET name=?, dob=?, gender=?, blood_group=?, phone=?, email=?, address=?, emergency_contact=?, allergies=?, status=?
     WHERE id=?`,
    [name, dob || null, gender, blood_group || null, phone || null, email || null, address || null, emergency_contact || null, allergies || null, status || "active", req.params.id]
  );
  req.flash("success", "Patient updated.");
  res.redirect(`/patients/${req.params.id}`);
});

router.delete("/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM patients WHERE id = ?", [req.params.id]);
  req.flash("success", "Patient record deleted.");
  res.redirect("/patients");
});

module.exports = router;
