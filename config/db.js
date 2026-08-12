// ── config/db.js ──────────────────────────────────────────────────
// Central MySQL connection pool. Every route imports `db` from here
// and runs parameterized queries: db.query("... WHERE id = ?", [id])

require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:               process.env.DB_HOST || "localhost",
  port:               process.env.DB_PORT || 3306,
  user:               process.env.DB_USER || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME || "hospital_management",
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  decimalNumbers:     true,
});

pool.getConnection()
  .then((conn) => {
    console.log("✅  MySQL connected →", process.env.DB_NAME || "hospital_management");
    conn.release();
  })
  .catch((err) => {
    console.error("❌  MySQL connection failed:", err.message);
    console.error("    Check your .env DB_* values and that MySQL is running.");
  });

module.exports = pool;
