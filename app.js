// ── app.js ────────────────────────────────────────────────────────
// Application entry point. Wires up security middleware, sessions,
// view engine, and mounts every route module.

require("dotenv").config();

const express        = require("express");
const path           = require("path");
const helmet         = require("helmet");
const session        = require("express-session");
const MySQLStore      = require("express-mysql-session")(session);
const flash            = require("connect-flash");
const cookieParser     = require("cookie-parser");
const methodOverride   = require("method-override");
const csrf              = require("csurf");
const rateLimit          = require("express-rate-limit");

const { attachUserToLocals } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// ── SECURITY HEADERS ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // relaxed for CDN assets (Bootstrap/Icons); tighten in production
}));

// ── VIEW ENGINE ───────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── BODY PARSING & STATIC FILES ────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// ── SESSION STORE (persisted in MySQL — survives server restarts) ───────
const sessionStore = new MySQLStore({
  host:     process.env.DB_HOST || "localhost",
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "hospital_management",
});

app.use(session({
  key:               "hms.sid",
  secret:            process.env.SESSION_SECRET || "insecure_dev_secret_change_me",
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 8, // 8 hour session
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
}));

app.use(flash());

// ── CSRF PROTECTION ───────────────────────────────────────────────────
app.use(csrf());
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// ── RATE LIMITING ON LOGIN (brute-force protection) ───────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth/login", loginLimiter);

// ── MAKE currentUser, flash, currentPath available everywhere ─────────
app.use(attachUserToLocals);
app.use((req, res, next) => { res.locals.currentPath = req.path; next(); });
app.locals.appName = "MediCore HMS";

// ── ROUTES ─────────────────────────────────────────────────────────────
app.use("/auth",         require("./routes/auth"));
app.use("/dashboard",    require("./routes/dashboard"));
app.use("/patients",     require("./routes/patients"));
app.use("/doctors",      require("./routes/doctors"));
app.use("/departments",  require("./routes/departments"));
app.use("/appointments", require("./routes/appointments"));
app.use("/wards",        require("./routes/wards"));
app.use("/pharmacy",     require("./routes/pharmacy"));
app.use("/lab",          require("./routes/lab"));
app.use("/billing",      require("./routes/billing"));
app.use("/accounting",   require("./routes/accounting"));
app.use("/users",        require("./routes/users"));
app.use("/settings",     require("./routes/settings"));
app.use("/portal",       require("./routes/portal"));

app.get("/", (req, res) => res.redirect(req.session.user ? "/dashboard" : "/auth/login"));

// ── 404 ─────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("errors/404", { title: "Not Found" });
});

// ── CENTRAL ERROR HANDLER ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    req.flash("error", "Form expired or invalid. Please try again.");
    return res.redirect("back");
  }
  console.error(err.stack);
  res.status(500).render("errors/500", { title: "Server Error", error: err });
});

// ── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("─".repeat(55));
  console.log(`  🏥  MediCore HMS running: http://localhost:${PORT}`);
  console.log("─".repeat(55));
});
