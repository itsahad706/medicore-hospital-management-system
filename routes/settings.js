// ── routes/settings.js ────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLoggedIn, hasRole } = require("../middleware/auth");

const DEFAULTS = {
  hospital_name: "MediCore Hospital",
  hospital_address: "",
  hospital_phone: "",
  currency_symbol: "Rs. ",
  invoice_footer_note: "Thank you for choosing MediCore Hospital.",
};

router.get("/", isLoggedIn, hasRole("admin"), async (req, res) => {
  const [rows] = await db.query("SELECT * FROM settings");
  const settings = { ...DEFAULTS };
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.render("settings/index", { title: "Settings", settings });
});

router.post("/", isLoggedIn, hasRole("admin"), async (req, res) => {
  for (const key of Object.keys(DEFAULTS)) {
    const value = req.body[key] ?? "";
    await db.query(
      "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [key, value, value]
    );
  }
  req.flash("success", "Settings saved.");
  res.redirect("/settings");
});

module.exports = router;
