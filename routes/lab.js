// ── routes/lab.js ─────────────────────────────────────────────────
// Lab test catalog + lab orders + result entry.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { logActivity } = require("../utils/helpers");

// ── TEST CATALOG ──────────────────────────────────────────────────
router.get("/tests", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [tests] = await db.query("SELECT * FROM lab_tests ORDER BY category, name");
  res.render("lab/tests", { title: "Test Catalog", tests });
});

router.post("/tests", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, category, price, normal_range, unit } = req.body;
  await db.query(
    "INSERT INTO lab_tests (name, category, price, normal_range, unit) VALUES (?, ?, ?, ?, ?)",
    [name, category || null, price || 0, normal_range || null, unit || null]
  );
  req.flash("success", "Lab test added.");
  res.redirect("/lab/tests");
});

router.put("/tests/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { name, category, price, normal_range, unit, status } = req.body;
  await db.query(
    "UPDATE lab_tests SET name=?, category=?, price=?, normal_range=?, unit=?, status=? WHERE id=?",
    [name, category || null, price || 0, normal_range || null, unit || null, status || "active", req.params.id]
  );
  req.flash("success", "Lab test updated.");
  res.redirect("/lab/tests");
});

router.delete("/tests/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM lab_tests WHERE id = ?", [req.params.id]);
  req.flash("success", "Lab test removed.");
  res.redirect("/lab/tests");
});

// ── LAB ORDERS ────────────────────────────────────────────────────
router.get("/orders", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  let sql = `SELECT lo.*, p.name AS patient_name, p.mrn, u.name AS doctor_name FROM lab_orders lo
             JOIN patients p ON lo.patient_id = p.id JOIN doctors d ON lo.doctor_id = d.id JOIN users u ON d.user_id = u.id
             WHERE 1=1`;
  const params = [];
  if (req.session.user.role === "doctor") {
    const [[doc]] = await db.query("SELECT id FROM doctors WHERE user_id = ?", [req.session.user.id]);
    sql += " AND lo.doctor_id = ?"; params.push(doc ? doc.id : 0);
  }
  sql += " ORDER BY lo.order_date DESC LIMIT 200";
  const [orders] = await db.query(sql, params);
  res.render("lab/orders", { title: "Lab Orders", orders });
});

router.get("/orders/new", isLoggedIn, hasRole("admin", "doctor"), async (req, res) => {
  const [patients] = await db.query("SELECT id, name, mrn FROM patients WHERE status='active' ORDER BY name");
  const [tests] = await db.query("SELECT id, name, price FROM lab_tests WHERE status='active' ORDER BY name");
  const [doctorsList] = await db.query("SELECT doc.id, u.name FROM doctors doc JOIN users u ON doc.user_id=u.id WHERE doc.status='active' ORDER BY u.name");
  let doctorId = "";
  if (req.session.user.role === "doctor") {
    const [[doc]] = await db.query("SELECT id FROM doctors WHERE user_id = ?", [req.session.user.id]);
    doctorId = doc ? doc.id : "";
  }
  res.render("lab/order-form", {
    title: "New Lab Order", patients, tests, doctorsList, doctorId,
    preselectPatient: req.query.patient_id || "", appointmentId: req.query.appointment_id || "",
  });
});

router.post("/orders", isLoggedIn, hasRole("admin", "doctor"), async (req, res) => {
  const { patient_id, doctor_id, appointment_id } = req.body;
  const testIds = [].concat(req.body.lab_test_id || []).filter(Boolean);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO lab_orders (patient_id, doctor_id, appointment_id) VALUES (?, ?, ?)",
      [patient_id, doctor_id, appointment_id || null]
    );
    for (const testId of testIds) {
      await conn.query("INSERT INTO lab_order_items (lab_order_id, lab_test_id) VALUES (?, ?)", [result.insertId, testId]);
    }
    await conn.commit();
    await logActivity(db, req.session.user.id, "lab_order_created", `Lab order #${result.insertId} created`, req.ip);
    req.flash("success", "Lab order created.");
    res.redirect("/lab/orders/" + result.insertId);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", "Failed to create lab order.");
    res.redirect("/lab/orders/new");
  } finally {
    conn.release();
  }
});

router.get("/orders/:id", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [[order]] = await db.query(
    `SELECT lo.*, p.name AS patient_name, p.mrn, u.name AS doctor_name FROM lab_orders lo
     JOIN patients p ON lo.patient_id = p.id JOIN doctors d ON lo.doctor_id = d.id JOIN users u ON d.user_id = u.id
     WHERE lo.id = ?`, [req.params.id]);
  if (!order) { req.flash("error", "Lab order not found."); return res.redirect("/lab/orders"); }
  const [items] = await db.query(
    `SELECT loi.*, lt.name AS test_name, lt.normal_range, lt.unit FROM lab_order_items loi
     JOIN lab_tests lt ON loi.lab_test_id = lt.id WHERE loi.lab_order_id = ?`, [order.id]);
  res.render("lab/order-view", { title: "Lab Order", order, items });
});

router.put("/orders/:orderId/items/:itemId", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { result_value, result_notes } = req.body;
  await db.query(
    "UPDATE lab_order_items SET result_value=?, result_notes=?, status='completed' WHERE id=?",
    [result_value || null, result_notes || null, req.params.itemId]
  );
  // If all items for this order are completed, mark the order completed too.
  const [[{ pendingCount }]] = await db.query(
    "SELECT COUNT(*) AS pendingCount FROM lab_order_items WHERE lab_order_id=? AND status='pending'", [req.params.orderId]);
  if (pendingCount === 0) {
    await db.query("UPDATE lab_orders SET status='completed' WHERE id=?", [req.params.orderId]);
  }
  req.flash("success", "Result saved.");
  res.redirect("/lab/orders/" + req.params.orderId);
});

module.exports = router;
