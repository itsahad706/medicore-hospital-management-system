// ── utils/helpers.js ──────────────────────────────────────────────
// Shared helper functions used across routes and views.

const pad = (n) => String(n).padStart(2, "0");
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── DATE RANGE RESOLVER ─────────────────────────────────────────────
// ?range=today|yesterday|week|month|year|all|custom  &from=&to=
function resolveDateRange(query) {
  const now = new Date();
  let range = query.range || "month";
  let start, end;

  if (query.from && query.to) {
    return { range: "custom", startDate: query.from, endDate: query.to, label: `${query.from} to ${query.to}` };
  }

  switch (range) {
    case "today": start = end = toStr(now); break;
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      start = end = toStr(y); break;
    }
    case "week": {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      start = toStr(monday); end = toStr(sunday); break;
    }
    case "year": start = `${now.getFullYear()}-01-01`; end = `${now.getFullYear()}-12-31`; break;
    case "all": start = "2000-01-01"; end = "2100-01-01"; break;
    case "month":
    default: {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      start = toStr(first); end = toStr(last); range = "month"; break;
    }
  }

  const labels = { today: "Today", yesterday: "Yesterday", week: "This Week", month: "This Month", year: "This Year", all: "All Time" };
  return { range, startDate: start, endDate: end, label: labels[range] || `${start} to ${end}` };
}

// ── SEQUENTIAL NUMBER GENERATORS ────────────────────────────────────
// Builds MRN-000001, INV-000001, etc. from the last row in a table.
async function nextSequence(db, table, column, prefix) {
  const [rows] = await db.query(`SELECT ${column} AS code FROM ${table} ORDER BY id DESC LIMIT 1`);
  let nextNum = 1;
  if (rows.length > 0 && rows[0].code) {
    const numPart = String(rows[0].code).replace(prefix, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }
  return `${prefix}${String(nextNum).padStart(6, "0")}`;
}

// ── CURRENCY FORMATTER ───────────────────────────────────────────────
function money(amount, symbol = "Rs. ") {
  const n = Number(amount || 0);
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── ACTIVITY LOGGER ───────────────────────────────────────────────────
async function logActivity(db, userId, action, description, ip) {
  try {
    await db.query(
      "INSERT INTO activity_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)",
      [userId || null, action, description || null, ip || null]
    );
  } catch (err) {
    console.error("Activity log failed:", err.message);
  }
}

// ── AGE FROM DOB ──────────────────────────────────────────────────────
function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

module.exports = { resolveDateRange, nextSequence, money, logActivity, calcAge };
