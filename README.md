# MediCore HMS — Hospital Management System

A complete, production-style Hospital Management System built with **Node.js + Express + MySQL + EJS + Bootstrap 5** — the same architecture pattern as the companion ERP project.

## Features

- **4 user roles**: Admin, Doctor, Receptionist, Patient (self-service portal)
- **OPD**: Patient registration, appointment scheduling, clinical notes
- **IPD**: Wards, beds, and admissions/discharge with live bed-status grid
- **Pharmacy**: Medicine catalog, batch stock with expiry tracking, prescriptions with dynamic line items
- **Laboratory**: Test catalog, lab orders, result entry, printable reports
- **Billing**: Invoices with dynamic line items, partial/full payments, printable invoices
- **Accounting**: Chart of accounts, general ledger, trial balance (double-entry, auto-posted from payments)
- **Admin**: User management, department management, hospital settings
- **Security**: bcrypt password hashing, session-based auth (MySQL-backed sessions), CSRF protection, rate-limited login, RBAC middleware, helmet security headers

## Stack

- Node.js, Express 4
- MySQL 8 (via `mysql2`)
- EJS templates + Bootstrap 5 + Bootstrap Icons
- express-session with `express-mysql-session` (persists across restarts)
- bcrypt, csurf, helmet, express-rate-limit, express-validator

## Setup

```bash
npm install
cp .env.example .env      # edit DB credentials
mysql -u root -p < database/schema.sql
npm run seed               # loads demo data + logins
npm run dev                 # or: npm start
```

Visit **http://localhost:3000**

## Demo Logins (after `npm run seed`)

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Receptionist | `reception` | `Reception@123` |
| Doctor | `dr.ahmed` | `Doctor@123` |
| Doctor | `dr.ayesha` | `Doctor@123` |
| Patient portal | `bilal.h` | `Patient@123` |

> ⚠️ Change these before deploying anywhere real.

## Project Structure

```
hms/
├── app.js                  # entry point
├── config/db.js            # MySQL pool
├── middleware/auth.js      # isLoggedIn, hasRole, locals
├── utils/helpers.js        # date ranges, sequences, money, activity log
├── database/
│   ├── schema.sql          # full DDL
│   └── seed.js             # demo data
├── routes/                 # one file per module
├── views/                  # EJS templates, one folder per module
│   └── partials/           # head, nav, alerts, csrf, scripts
└── public/                 # css/js assets
```

## Notes

- Doctor accounts are created together with their professional profile under **Doctors → Add Doctor**, not through the generic Users screen.
- The patient portal is strictly scoped server-side to the logged-in patient's own `patient_id` — it never trusts a patient ID from the client.
- Accounting postings are intentionally simple: each payment posts a Cash-debit / Patient-Revenue-credit pair. Extend `routes/billing.js` if you need per-item revenue accounts (e.g. splitting pharmacy vs. consultation revenue).
- Session store, CSRF tokens, and rate limiting are already wired in `app.js` — no extra setup needed.
