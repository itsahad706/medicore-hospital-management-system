// ── routes/wards.js ───────────────────────────────────────────────
// Wards, Beds, and Admissions (IPD).
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

// ── WARDS + BED GRID ──────────────────────────────────────────────
router.get("/", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [wards] = await db.query("SELECT * FROM wards ORDER BY name");
  const [beds] = await db.query("SELECT * FROM beds ORDER BY ward_id, bed_number");
  const wardsWithBeds = wards.map(w => ({ ...w, beds: beds.filter(b => b.ward_id === w.id) }));
  res.render("wards/list", { title: "Wards & Beds", wards: wardsWithBeds });
});

router.post("/", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, type, floor, daily_charge, bed_count } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO wards (name, type, floor, daily_charge) VALUES (?, ?, ?, ?)",
      [name, type || "general", floor || null, daily_charge || 0]
    );
    const count = parseInt(bed_count, 10) || 0;
    for (let i = 1; i <= count; i++) {
      await conn.query("INSERT INTO beds (ward_id, bed_number) VALUES (?, ?)", [result.insertId, String(i).padStart(2, "0")]);
    }
    await conn.commit();
    req.flash("success", `Ward "${name}" created with ${count} beds.`);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", "Failed to create ward.");
  } finally {
    conn.release();
  }
  res.redirect("/wards");
});

router.put("/beds/:id/status", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  await db.query("UPDATE beds SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
  req.flash("success", "Bed status updated.");
  res.redirect("/wards");
});

// ── ADMISSIONS ────────────────────────────────────────────────────
router.get("/admissions", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [admissions] = await db.query(
    `SELECT ad.*, p.name AS patient_name, p.mrn, w.name AS ward_name, b.bed_number, u.name AS doctor_name
     FROM admissions ad JOIN patients p ON ad.patient_id = p.id
     JOIN beds b ON ad.bed_id = b.id JOIN wards w ON b.ward_id = w.id
     JOIN doctors d ON ad.doctor_id = d.id JOIN users u ON d.user_id = u.id
     ORDER BY ad.status = 'admitted' DESC, ad.admission_date DESC LIMIT 200`);
  res.render("wards/admissions", { title: "Admissions", admissions });
});

router.get("/admissions/new", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [patients] = await db.query("SELECT id, name, mrn FROM patients WHERE status='active' ORDER BY name");
  const [doctors] = await db.query("SELECT doc.id, u.name FROM doctors doc JOIN users u ON doc.user_id=u.id WHERE doc.status='active' ORDER BY u.name");
  const [availableBeds] = await db.query(
    `SELECT b.id, b.bed_number, w.name AS ward_name FROM beds b JOIN wards w ON b.ward_id = w.id
     WHERE b.status = 'available' ORDER BY w.name, b.bed_number`);
  res.render("wards/admission-form", { title: "New Admission", patients, doctors, availableBeds, preselectPatient: req.query.patient_id || "" });
});

router.post("/admissions", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const { patient_id, bed_id, doctor_id, diagnosis, notes } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[bed]] = await conn.query("SELECT * FROM beds WHERE id = ? AND status = 'available' FOR UPDATE", [bed_id]);
    if (!bed) throw new Error("Bed is no longer available.");
    await conn.query(
      "INSERT INTO admissions (patient_id, bed_id, doctor_id, diagnosis, notes) VALUES (?, ?, ?, ?, ?)",
      [patient_id, bed_id, doctor_id, diagnosis || null, notes || null]
    );
    await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [bed_id]);
    await conn.commit();
    await logActivity(db, req.session.user.id, "patient_admitted", `Admitted patient #${patient_id} to bed #${bed_id}`, req.ip);
    req.flash("success", "Patient admitted successfully.");
    res.redirect("/wards/admissions");
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", err.message || "Failed to admit patient.");
    res.redirect("/wards/admissions/new");
  } finally {
    conn.release();
  }
});

router.put("/admissions/:id/discharge", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[admission]] = await conn.query("SELECT * FROM admissions WHERE id = ?", [req.params.id]);
    if (!admission) throw new Error("Admission not found.");
    await conn.query("UPDATE admissions SET status='discharged', discharge_date=NOW() WHERE id=?", [req.params.id]);
    await conn.query("UPDATE beds SET status='available' WHERE id=?", [admission.bed_id]);
    await conn.commit();
    req.flash("success", "Patient discharged. Bed is now available.");
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", "Failed to discharge patient.");
  } finally {
    conn.release();
  }
  res.redirect("/wards/admissions");
});

module.exports = router;
