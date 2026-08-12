// ── routes/accounting.js ──────────────────────────────────────────
// Basic double-entry accounting: Chart of Accounts, General Ledger,
// Trial Balance. Kept simple — this powers the "accounting engine"
// tier of the HMS without trying to be a full GL system.
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");
const { money } = require("../utils/helpers");

router.get("/accounts", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [accounts] = await db.query("SELECT * FROM accounts ORDER BY code");
  res.render("accounting/accounts", { title: "Chart of Accounts", accounts });
});

router.post("/accounts", isLoggedIn, hasRole("admin"), async (req, res) => {
  const { code, name, type, parent_id } = req.body;
  try {
    await db.query("INSERT INTO accounts (code, name, type, parent_id) VALUES (?, ?, ?, ?)", [code, name, type, parent_id || null]);
    req.flash("success", "Account added.");
  } catch (err) {
    req.flash("error", "Could not add account (code may already exist).");
  }
  res.redirect("/accounting/accounts");
});

router.delete("/accounts/:id", isLoggedIn, hasRole("admin"), async (req, res) => {
  await db.query("DELETE FROM accounts WHERE id = ?", [req.params.id]);
  req.flash("success", "Account deleted.");
  res.redirect("/accounting/accounts");
});

router.get("/ledger", isLoggedIn, hasRole("admin"), async (req, res) => {
  const accountId = req.query.account_id;
  const [accounts] = await db.query("SELECT * FROM accounts ORDER BY code");
  let entries = [];
  if (accountId) {
    [entries] = await db.query(
      `SELECT te.*, t.transaction_date, t.reference, t.description FROM transaction_entries te
       JOIN transactions t ON te.transaction_id = t.id WHERE te.account_id = ? ORDER BY t.transaction_date DESC LIMIT 200`,
      [accountId]);
  }
  res.render("accounting/ledger", { title: "General Ledger", accounts, entries, accountId: accountId || "", money });
});

router.get("/trial-balance", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.code, a.name, a.type, COALESCE(SUM(te.debit),0) AS total_debit, COALESCE(SUM(te.credit),0) AS total_credit
     FROM accounts a LEFT JOIN transaction_entries te ON te.account_id = a.id
     GROUP BY a.id ORDER BY a.code`);
  const totals = rows.reduce((acc, r) => ({
    debit: acc.debit + Number(r.total_debit), credit: acc.credit + Number(r.total_credit),
  }), { debit: 0, credit: 0 });
  res.render("accounting/trial-balance", { title: "Trial Balance", rows, totals, money });
});

module.exports = router;
