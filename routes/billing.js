// ── routes/billing.js ─────────────────────────────────────────────
// Invoices (with line items) + Payments. Posts a simple double-entry
// transaction to the accounting ledger whenever a payment is recorded.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { nextSequence, logActivity, money } = require("../utils/helpers");

// ── INVOICES ──────────────────────────────────────────────────────
router.get("/invoices", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const { status } = req.query;
  let sql = `SELECT i.*, p.name AS patient_name, p.mrn FROM invoices i JOIN patients p ON i.patient_id = p.id WHERE 1=1`;
  const params = [];
  if (status) { sql += " AND i.status = ?"; params.push(status); }
  sql += " ORDER BY i.created_at DESC LIMIT 200";
  const [invoices] = await db.query(sql, params);
  res.render("billing/invoices", { title: "Invoices", invoices, money, filters: { status: status || "" } });
});

router.get("/invoices/new", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [patients] = await db.query("SELECT id, name, mrn FROM patients WHERE status='active' ORDER BY name");
  const [medicines] = await db.query("SELECT id, name, unit_price FROM medicines WHERE status='active' ORDER BY name");
  const [tests] = await db.query("SELECT id, name, price FROM lab_tests WHERE status='active' ORDER BY name");
  res.render("billing/invoice-form", {
    title: "New Invoice", patients, medicines, tests,
    preselectPatient: req.query.patient_id || "", appointmentId: req.query.appointment_id || "",
  });
});

router.post("/invoices", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const { patient_id, appointment_id, discount, tax } = req.body;
  const descriptions = [].concat(req.body.description || []);
  const itemTypes = [].concat(req.body.item_type || []);
  const qtys = [].concat(req.body.quantity || []);
  const prices = [].concat(req.body.unit_price || []);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let subtotal = 0;
    const items = [];
    for (let i = 0; i < descriptions.length; i++) {
      if (!descriptions[i]) continue;
      const qty = parseFloat(qtys[i]) || 0;
      const price = parseFloat(prices[i]) || 0;
      const amount = qty * price;
      subtotal += amount;
      items.push({ description: descriptions[i], item_type: itemTypes[i] || "other", qty, price, amount });
    }
    const discountVal = parseFloat(discount) || 0;
    const taxVal = parseFloat(tax) || 0;
    const total = subtotal - discountVal + taxVal;

    const invoiceNumber = await nextSequence(conn, "invoices", "invoice_number", "INV-");
    const [result] = await conn.query(
      `INSERT INTO invoices (invoice_number, patient_id, appointment_id, subtotal, discount, tax, total, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, patient_id, appointment_id || null, subtotal, discountVal, taxVal, total, req.session.user.id]
    );
    for (const item of items) {
      await conn.query(
        "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?)",
        [result.insertId, item.item_type, item.description, item.qty, item.price, item.amount]
      );
    }
    await conn.commit();
    await logActivity(db, req.session.user.id, "invoice_created", `Invoice ${invoiceNumber} created`, req.ip);
    req.flash("success", `Invoice ${invoiceNumber} created.`);
    res.redirect("/billing/invoices/" + result.insertId);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", "Failed to create invoice.");
    res.redirect("/billing/invoices/new");
  } finally {
    conn.release();
  }
});

router.get("/invoices/:id", isLoggedIn, hasRole("admin", "receptionist", "doctor"), async (req, res) => {
  const [[invoice]] = await db.query(
    `SELECT i.*, p.name AS patient_name, p.mrn, p.address, p.phone FROM invoices i JOIN patients p ON i.patient_id = p.id WHERE i.id = ?`,
    [req.params.id]);
  if (!invoice) { req.flash("error", "Invoice not found."); return res.redirect("/billing/invoices"); }
  const [items] = await db.query("SELECT * FROM invoice_items WHERE invoice_id = ?", [invoice.id]);
  const [payments] = await db.query("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC", [invoice.id]);
  res.render("billing/invoice-view", { title: invoice.invoice_number, invoice, items, payments, money });
});

router.delete("/invoices/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("UPDATE invoices SET status='cancelled' WHERE id=?", [req.params.id]);
  req.flash("success", "Invoice cancelled.");
  res.redirect("/billing/invoices");
});

// ── PAYMENTS ──────────────────────────────────────────────────────
router.get("/payments", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const [payments] = await db.query(
    `SELECT pay.*, i.invoice_number, p.name AS patient_name FROM payments pay
     JOIN invoices i ON pay.invoice_id = i.id JOIN patients p ON i.patient_id = p.id
     ORDER BY pay.payment_date DESC LIMIT 200`);
  res.render("billing/payments", { title: "Payments", payments, money });
});

router.post("/invoices/:id/payments", isLoggedIn, hasRole("admin", "receptionist"), async (req, res) => {
  const { amount, payment_method, reference_no } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[invoice]] = await conn.query("SELECT * FROM invoices WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!invoice) throw new Error("Invoice not found.");
    const payAmount = parseFloat(amount) || 0;

    await conn.query(
      "INSERT INTO payments (invoice_id, amount, payment_method, reference_no, received_by) VALUES (?, ?, ?, ?, ?)",
      [invoice.id, payAmount, payment_method || "cash", reference_no || null, req.session.user.id]
    );

    const newPaid = Number(invoice.amount_paid) + payAmount;
    const newStatus = newPaid >= Number(invoice.total) ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    await conn.query("UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?", [newPaid, newStatus, invoice.id]);

    // Simple ledger posting: Debit Cash, Credit Patient Revenue (best-effort; skipped if COA not seeded)
    const [[cashAcct]] = await conn.query("SELECT id FROM accounts WHERE code = '1000' LIMIT 1");
    const [[revenueAcct]] = await conn.query("SELECT id FROM accounts WHERE code = '4000' LIMIT 1");
    if (cashAcct && revenueAcct) {
      const [txResult] = await conn.query(
        "INSERT INTO transactions (reference, description, created_by) VALUES (?, ?, ?)",
        [invoice.invoice_number, `Payment received for ${invoice.invoice_number}`, req.session.user.id]
      );
      await conn.query("INSERT INTO transaction_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, 0)", [txResult.insertId, cashAcct.id, payAmount]);
      await conn.query("INSERT INTO transaction_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, 0, ?)", [txResult.insertId, revenueAcct.id, payAmount]);
    }

    await conn.commit();
    await logActivity(db, req.session.user.id, "payment_recorded", `Payment of ${payAmount} for ${invoice.invoice_number}`, req.ip);
    req.flash("success", "Payment recorded.");
    res.redirect("/billing/invoices/" + invoice.id);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash("error", err.message || "Failed to record payment.");
    res.redirect("/billing/invoices/" + req.params.id);
  } finally {
    conn.release();
  }
});

module.exports = router;
