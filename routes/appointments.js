// ── routes/appointments.js ────────────────────────────────────────
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

router.get("/", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const { date, status, doctor_id } = req.query;
  let sql = `SELECT a.*, p.name AS patient_name, p.mrn, u.name AS doctor_name FROM appointments a
             JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
             WHERE 1=1`;
  const params = [];

  if (req.session.user.role === "doctor") {
    const [[doc]] = await db.query("SELECT id FROM doctors WHERE user_id = ?", [req.session.user.id]);
    sql += " AND a.doctor_id = ?"; params.push(doc ? doc.id : 0);
  } else if (doctor_id) { sql += " AND a.doctor_id = ?"; params.push(doctor_id); }

  if (date) { sql += " AND a.appointment_date = ?"; params.push(date); }
  if (status) { sql += " AND a.status = ?"; params.push(status); }

  sql += " ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 200";
  const [appointments] = await db.query(sql, params);
  const [doctors] = await db.query("SELECT doc.id, u.name FROM doctors doc JOIN users u ON doc.user_id=u.id WHERE doc.status='active' ORDER BY u.name");

  res.render("appointments/list", { title: "Appointments", appointments, doctors, filters: { date: date || "", status: status || "", doctor_id: doctor_id || "" } });
});

router.get("/new", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [patients] = await db.query("SELECT id, name, mrn FROM patients WHERE status='active' ORDER BY name");
  const [doctors] = await db.query(
    `SELECT doc.id, u.name, doc.consultation_fee, dep.name AS dept FROM doctors doc
     JOIN users u ON doc.user_id=u.id LEFT JOIN departments dep ON doc.department_id=dep.id
     WHERE doc.status='active' ORDER BY u.name`);
  res.render("appointments/form", { title: "Book Appointment", patients, doctors, preselectPatient: req.query.patient_id || "" });
});

router.post(
  "/", isLoggedIn, hasRole("admin", "receptionist"),
  [
    body("patient_id").notEmpty(), body("doctor_id").notEmpty(),
    body("appointment_date").notEmpty(), body("appointment_time").notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", "Please fill in all required fields.");
      return res.redirect("/appointments/new");
    }
    try {
      const { patient_id, doctor_id, appointment_date, appointment_time, reason, notes } = req.body;
      const [[doc]] = await db.query("SELECT department_id FROM doctors WHERE id = ?", [doctor_id]);
      await db.query(
        `INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, reason, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [patient_id, doctor_id, doc ? doc.department_id : null, appointment_date, appointment_time, reason || null, notes || null, req.session.user.id]
      );
      await logActivity(db, req.session.user.id, "appointment_booked", `Booked appointment for patient #${patient_id}`, req.ip);
      req.flash("success", "Appointment booked.");
      res.redirect("/appointments");
    } catch (err) {
      console.error(err);
      req.flash("error", "Failed to book appointment.");
      res.redirect("/appointments/new");
    }
  }
);

router.get("/:id", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [[appt]] = await db.query(
    `SELECT a.*, p.name AS patient_name, p.mrn, p.id AS patient_id, p.allergies, u.name AS doctor_name FROM appointments a
     JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE a.id = ?`, [req.params.id]);
  if (!appt) { req.flash("error", "Appointment not found."); return res.redirect("/appointments"); }
  res.render("appointments/view", { title: "Appointment", appt });
});

router.put("/:id/status", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  await db.query("UPDATE appointments SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
  req.flash("success", "Appointment status updated.");
  res.redirect("/appointments/" + req.params.id);
});

router.put("/:id/notes", isLoggedIn, hasRole("admin", "doctor"), async (req, res) => {
  await db.query("UPDATE appointments SET notes = ? WHERE id = ?", [req.body.notes, req.params.id]);
  req.flash("success", "Clinical notes saved.");
  res.redirect("/appointments/" + req.params.id);
});

router.delete("/:id", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  await db.query("DELETE FROM appointments WHERE id = ?", [req.params.id]);
  req.flash("success", "Appointment cancelled and removed.");
  res.redirect("/appointments");
});

module.exports = router;
