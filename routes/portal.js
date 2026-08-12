// ── routes/portal.js ──────────────────────────────────────────────
// Patient self-service portal: view own appointments, prescriptions,
// lab results, and invoices. Strictly scoped to the logged-in patient's
// own patient_id — never accepts a patient_id from the client.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { money } = require("../utils/helpers");

async function getOwnPatientId(req) {
  const [[patient]] = await db.query("SELECT id FROM patients WHERE user_id = ?", [req.session.user.id]);
  return patient ? patient.id : null;
}

router.get("/appointments", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  if (!patientId) return res.render("portal/appointments", { title: "My Appointments", appointments: [] });
  const [appointments] = await db.query(
    `SELECT a.*, u.name AS doctor_name FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE a.patient_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [patientId]);
  res.render("portal/appointments", { title: "My Appointments", appointments });
});

router.get("/prescriptions", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  if (!patientId) return res.render("portal/prescriptions", { title: "My Prescriptions", prescriptions: [] });
  const [prescriptions] = await db.query(
    `SELECT pr.*, u.name AS doctor_name FROM prescriptions pr
     JOIN doctors d ON pr.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE pr.patient_id = ? ORDER BY pr.created_at DESC`, [patientId]);
  res.render("portal/prescriptions", { title: "My Prescriptions", prescriptions });
});

router.get("/prescriptions/:id", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  const [[prescription]] = await db.query(
    `SELECT pr.*, u.name AS doctor_name FROM prescriptions pr
     JOIN doctors d ON pr.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE pr.id = ? AND pr.patient_id = ?`, [req.params.id, patientId]);
  if (!prescription) { req.flash("error", "Prescription not found."); return res.redirect("/portal/prescriptions"); }
  const [items] = await db.query(
    `SELECT pi.*, m.name AS medicine_name, m.unit FROM prescription_items pi
     JOIN medicines m ON pi.medicine_id = m.id WHERE pi.prescription_id = ?`, [prescription.id]);
  res.render("portal/prescription-detail", { title: "Prescription", prescription, items });
});

router.get("/lab-results", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  if (!patientId) return res.render("portal/lab-results", { title: "My Lab Results", orders: [] });
  const [orders] = await db.query(
    `SELECT lo.*, u.name AS doctor_name FROM lab_orders lo
     JOIN doctors d ON lo.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE lo.patient_id = ? ORDER BY lo.order_date DESC`, [patientId]);
  res.render("portal/lab-results", { title: "My Lab Results", orders });
});

router.get("/lab-results/:id", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  const [[order]] = await db.query(
    `SELECT lo.*, u.name AS doctor_name FROM lab_orders lo
     JOIN doctors d ON lo.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE lo.id = ? AND lo.patient_id = ?`, [req.params.id, patientId]);
  if (!order) { req.flash("error", "Lab order not found."); return res.redirect("/portal/lab-results"); }
  const [items] = await db.query(
    `SELECT loi.*, lt.name AS test_name, lt.normal_range, lt.unit FROM lab_order_items loi
     JOIN lab_tests lt ON loi.lab_test_id = lt.id WHERE loi.lab_order_id = ?`, [order.id]);
  res.render("portal/lab-result-detail", { title: "Lab Result", order, items });
});

router.get("/invoices", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  if (!patientId) return res.render("portal/invoices", { title: "My Invoices", invoices: [], money });
  const [invoices] = await db.query("SELECT * FROM invoices WHERE patient_id = ? ORDER BY invoice_date DESC", [patientId]);
  res.render("portal/invoices", { title: "My Invoices", invoices, money });
});

router.get("/invoices/:id", isLoggedIn, hasRole("patient"), async (req, res) => {
  const patientId = await getOwnPatientId(req);
  const [[invoice]] = await db.query(
    `SELECT i.*, p.name AS patient_name, p.mrn, p.address, p.phone FROM invoices i JOIN patients p ON i.patient_id = p.id
     WHERE i.id = ? AND i.patient_id = ?`, [req.params.id, patientId]);
  if (!invoice) { req.flash("error", "Invoice not found."); return res.redirect("/portal/invoices"); }
  const [items] = await db.query("SELECT * FROM invoice_items WHERE invoice_id = ?", [invoice.id]);
  const [payments] = await db.query("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC", [invoice.id]);
  res.render("billing/invoice-view", { title: invoice.invoice_number, invoice, items, payments, money });
});

module.exports = router;
