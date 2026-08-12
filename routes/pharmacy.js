// ── routes/pharmacy.js ────────────────────────────────────────────
// Medicines catalog, Stock (batches), Prescriptions & dispensing.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

// ── MEDICINES CATALOG ─────────────────────────────────────────────
router.get("/medicines", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [medicines] = await db.query(
    `SELECT m.*, COALESCE(SUM(ms.quantity),0) AS in_stock FROM medicines m
     LEFT JOIN medicine_stock ms ON ms.medicine_id = m.id
     GROUP BY m.id ORDER BY m.name`);
  res.render("pharmacy/medicines", { title: "Medicines", medicines });
});

router.post("/medicines", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, generic_name, category, unit, unit_price, reorder_level } = req.body;
  await db.query(
    "INSERT INTO medicines (name, generic_name, category, unit, unit_price, reorder_level) VALUES (?, ?, ?, ?, ?, ?)",
    [name, generic_name || null, category || null, unit || "tablet", unit_price || 0, reorder_level || 20]
  );
  req.flash("success", "Medicine added to catalog.");
  res.redirect("/pharmacy/medicines");
});

router.put("/medicines/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, generic_name, category, unit, unit_price, reorder_level, status } = req.body;
  await db.query(
    "UPDATE medicines SET name=?, generic_name=?, category=?, unit=?, unit_price=?, reorder_level=?, status=? WHERE id=?",
    [name, generic_name || null, category || null, unit || "tablet", unit_price || 0, reorder_level || 20, status || "active", req.params.id]
  );
  req.flash("success", "Medicine updated.");
  res.redirect("/pharmacy/medicines");
});

router.delete("/medicines/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM medicines WHERE id = ?", [req.params.id]);
  req.flash("success", "Medicine removed from catalog.");
  res.redirect("/pharmacy/medicines");
});

// ── STOCK (batches) ───────────────────────────────────────────────
router.get("/stock", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [stock] = await db.query(
    `SELECT ms.*, m.name AS medicine_name, m.unit FROM medicine_stock ms
     JOIN medicines m ON ms.medicine_id = m.id ORDER BY ms.expiry_date ASC`);
  const [medicines] = await db.query("SELECT id, name FROM medicines WHERE status='active' ORDER BY name");
  res.render("pharmacy/stock", { title: "Stock", stock, medicines });
});

router.post("/stock", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const { medicine_id, batch_no, quantity, purchase_price, expiry_date } = req.body;
  await db.query(
    "INSERT INTO medicine_stock (medicine_id, batch_no, quantity, purchase_price, expiry_date) VALUES (?, ?, ?, ?, ?)",
    [medicine_id, batch_no || null, quantity || 0, purchase_price || 0, expiry_date || null]
  );
  req.flash("success", "Stock received.");
  res.redirect("/pharmacy/stock");
});

router.delete("/stock/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM medicine_stock WHERE id = ?", [req.params.id]);
  req.flash("success", "Stock batch removed.");
  res.redirect("/pharmacy/stock");
});

// ── PRESCRIPTIONS ─────────────────────────────────────────────────
router.get("/prescriptions", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  let sql = `SELECT pr.*, p.name AS patient_name, p.mrn, u.name AS doctor_name FROM prescriptions pr
             JOIN patients p ON pr.patient_id = p.id JOIN doctors d ON pr.doctor_id = d.id JOIN users u ON d.user_id = u.id
             WHERE 1=1`;
  const params = [];
  if (req.session.user.role === "doctor") {
    const [[doc]] = await db.query("SELECT id FROM doctors WHERE user_id = ?", [req.session.user.id]);
    sql += " AND pr.doctor_id = ?"; params.push(doc ? doc.id : 0);
  }
  sql += " ORDER BY pr.created_at DESC LIMIT 200";
  const [prescriptions] = await db.query(sql, params);
  res.render("pharmacy/prescriptions", { title: "Prescriptions", prescriptions });
});

router.get("/prescriptions/new", isLoggedIn, hasRole("admin", "doctor"), async (req, res) => {
  const [patients] = await db.query("SELECT id, name, mrn FROM patients WHERE status='active' ORDER BY name");
  const [medicines] = await db.query("SELECT id, name, unit_price FROM medicines WHERE status='active' ORDER BY name");
  const [doctorsList] = await db.query("SELECT doc.id, u.name FROM doctors doc JOIN users u ON doc.user_id=u.id WHERE doc.status='active' ORDER BY u.name");
  let doctorId = req.query.doctor_id || "";
  if (req.session.user.role === "doctor") {
    const [[doc]] = await db.query("SELECT id FROM doctors WHERE user_id = ?", [req.session.user.id]);
    doctorId = doc ? doc.id : "";
  }
  res.render("pharmacy/prescription-form", {
    title: "New Prescription", patients, medicines, doctorsList,
    preselectPatient: req.query.patient_id || "", appointmentId: req.query.appointment_id || "", doctorId,
  });
});

router.post("/prescriptions", isLoggedIn, hasRole("admin", "doctor"), async (req, res) => {
  const { patient_id, doctor_id, appointment_id, notes } = req.body;
  let medicine_id = [].concat(req.body.medicine_id || []);
  let dosage = [].concat(req.body.dosage || []);
  let frequency = [].concat(req.body.frequency || []);
  let duration = [].concat(req.body.duration || []);
  let quantity = [].concat(req.body.quantity || []);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, notes) VALUES (?, ?, ?, ?)",
      [appointment_id || null, patient_id, doctor_id, notes || null]
    );
    for (let i = 0; i < medicine_id.length; i++) {
      if (!medicine_id[i]) continue;
      await conn.query(
        "INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration, quantity) VALUES (?, ?, ?, ?, ?, ?)",
        [result.insertId, medicine_id[i], dosage[i] || null, frequency[i] || null, duration[i] || null, quantity[i] || 1]
      );
    }
    await conn.commit();
    await logActivity(db, req.session.user.id, "prescription_created", `Prescription #${result.insertId} created`, req.ip);
    req.flash("success", "Prescription created.");
    res.redirect("/pharmacy/prescriptions/" + result.insertId);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", "Failed to create prescription.");
    res.redirect("/pharmacy/prescriptions/new");
  } finally {
    conn.release();
  }
});

router.get("/prescriptions/:id", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [[prescription]] = await db.query(
    `SELECT pr.*, p.name AS patient_name, p.mrn, u.name AS doctor_name FROM prescriptions pr
     JOIN patients p ON pr.patient_id = p.id JOIN doctors d ON pr.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE pr.id = ?`, [req.params.id]);
  if (!prescription) { req.flash("error", "Prescription not found."); return res.redirect("/pharmacy/prescriptions"); }
  const [items] = await db.query(
    `SELECT pi.*, m.name AS medicine_name, m.unit FROM prescription_items pi
     JOIN medicines m ON pi.medicine_id = m.id WHERE pi.prescription_id = ?`, [prescription.id]);
  res.render("pharmacy/prescription-view", { title: "Prescription", prescription, items });
});

router.put("/prescriptions/:id/dispense", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  await db.query("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?", [req.params.id]);
  req.flash("success", "Prescription marked as dispensed.");
  res.redirect("/pharmacy/prescriptions/" + req.params.id);
});

module.exports = router;
