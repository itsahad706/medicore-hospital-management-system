// ── routes/dashboard.js ───────────────────────────────────────────
// Role-specific landing dashboards: admin/receptionist see org-wide
// stats, doctors see their own schedule, patients see their own care.

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn } = require("../middleware/auth");
const { money } = require("../utils/helpers");

router.get("/", isLoggedIn, async (req, res) => {
  const role = req.session.user.role;

  try {
    if (role === "patient") {
      const [[patient]] = await db.query("SELECT * FROM patients WHERE user_id = ? LIMIT 1", [req.session.user.id]);
      if (!patient) {
        return res.render("dashboard/patient", { title: "Dashboard", patient: null, appointments: [], invoices: [], money });
      }
      const [appointments] = await db.query(
        `SELECT a.*, d.id AS doc_id, u.name AS doctor_name FROM appointments a
         JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
         WHERE a.patient_id = ? AND a.appointment_date >= CURDATE() AND a.status='scheduled'
         ORDER BY a.appointment_date, a.appointment_time LIMIT 5`, [patient.id]);
      const [invoices] = await db.query(
        "SELECT * FROM invoices WHERE patient_id = ? AND status != 'paid' ORDER BY invoice_date DESC LIMIT 5", [patient.id]);
      return res.render("dashboard/patient", { title: "Dashboard", patient, appointments, invoices, money });
    }

    if (role === "doctor") {
      const [[doctor]] = await db.query("SELECT * FROM doctors WHERE user_id = ? LIMIT 1", [req.session.user.id]);
      const doctorId = doctor ? doctor.id : 0;
      const [todayAppts] = await db.query(
        `SELECT a.*, p.name AS patient_name, p.mrn FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.doctor_id = ? AND a.appointment_date = CURDATE()
         ORDER BY a.appointment_time`, [doctorId]);
      const [[{ upcomingCount }]] = await db.query(
        `SELECT COUNT(*) AS upcomingCount FROM appointments
         WHERE doctor_id = ? AND appointment_date >= CURDATE() AND status='scheduled'`, [doctorId]);
      const [[{ patientCount }]] = await db.query(
        `SELECT COUNT(DISTINCT patient_id) AS patientCount FROM appointments WHERE doctor_id = ?`, [doctorId]);
      const [pendingLab] = await db.query(
        `SELECT lo.*, p.name AS patient_name FROM lab_orders lo
         JOIN patients p ON lo.patient_id = p.id
         WHERE lo.doctor_id = ? AND lo.status = 'pending' ORDER BY lo.order_date DESC LIMIT 5`, [doctorId]);
      return res.render("dashboard/doctor", {
        title: "Dashboard", doctor, todayAppts, upcomingCount, patientCount, pendingLab,
      });
    }

    // admin / receptionist — org-wide overview
    const [[{ patientCount }]] = await db.query("SELECT COUNT(*) AS patientCount FROM patients");
    const [[{ doctorCount }]] = await db.query("SELECT COUNT(*) AS doctorCount FROM doctors WHERE status='active'");
    const [[{ todayApptCount }]] = await db.query(
      "SELECT COUNT(*) AS todayApptCount FROM appointments WHERE appointment_date = CURDATE()");
    const [[{ admittedCount }]] = await db.query(
      "SELECT COUNT(*) AS admittedCount FROM admissions WHERE status='admitted'");
    const [[{ bedTotal }]] = await db.query("SELECT COUNT(*) AS bedTotal FROM beds");
    const [[{ bedOccupied }]] = await db.query("SELECT COUNT(*) AS bedOccupied FROM beds WHERE status='occupied'");
    const [[{ revenueToday }]] = await db.query(
      "SELECT COALESCE(SUM(amount),0) AS revenueToday FROM payments WHERE DATE(payment_date) = CURDATE()");
    const [[{ unpaidTotal }]] = await db.query(
      "SELECT COALESCE(SUM(total-amount_paid),0) AS unpaidTotal FROM invoices WHERE status IN ('unpaid','partial')");

    const [todayAppts] = await db.query(
      `SELECT a.*, p.name AS patient_name, u.name AS doctor_name FROM appointments a
       JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
       WHERE a.appointment_date = CURDATE() ORDER BY a.appointment_time LIMIT 8`);

    const [lowStock] = await db.query(
      `SELECT m.name, m.reorder_level, COALESCE(SUM(ms.quantity),0) AS qty FROM medicines m
       LEFT JOIN medicine_stock ms ON ms.medicine_id = m.id
       GROUP BY m.id HAVING qty <= m.reorder_level LIMIT 6`);

    res.render("dashboard/admin", {
      title: "Dashboard", patientCount, doctorCount, todayApptCount, admittedCount,
      bedTotal, bedOccupied, revenueToday, unpaidTotal, todayAppts, lowStock, money,
    });

  } catch (err) {
    console.error(err);
    req.flash("error", "Could not load dashboard.");
    res.render("dashboard/admin", {
      title: "Dashboard", patientCount: 0, doctorCount: 0, todayApptCount: 0, admittedCount: 0,
      bedTotal: 0, bedOccupied: 0, revenueToday: 0, unpaidTotal: 0, todayAppts: [], lowStock: [], money,
    });
  }
});

module.exports = router;
