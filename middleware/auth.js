// ── middleware/auth.js ────────────────────────────────────────────
// Authentication guard + role-based access control (RBAC).
// Roles: admin, doctor, receptionist, patient. 'admin' is superuser.
//
// Usage: router.get("/patients", isLoggedIn, hasRole("admin","receptionist","doctor"), handler)

function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash("error", "Please log in to continue.");
  return res.redirect("/auth/login");
}

function isGuest(req, res, next) {
  if (req.session && req.session.user) return res.redirect("/dashboard");
  next();
}

function hasRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.session?.user?.role;
    if (!role) {
      req.flash("error", "Please log in to continue.");
      return res.redirect("/auth/login");
    }
    if (role === "admin" || allowedRoles.includes(role)) return next();
    req.flash("error", "You don't have permission to access that page.");
    return res.redirect("/dashboard");
  };
}

function attachUserToLocals(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
}

module.exports = { isLoggedIn, isGuest, hasRole, attachUserToLocals };
