-- ═══════════════════════════════════════════════════════════════════
--  Hospital Management System — Database Schema (MySQL 8+)
-- ═══════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS hospital_management
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hospital_management;

-- ── USERS & AUTH ──────────────────────────────────────────────────
-- Every login (admin, doctor, receptionist, patient-portal) is a row
-- here. Doctors/patients get an optional linked profile row below.
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  username      VARCHAR(60)  NOT NULL UNIQUE,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  role          ENUM('admin','doctor','receptionist','patient') NOT NULL,
  phone         VARCHAR(30),
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  last_login    DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NULL,
  action        VARCHAR(60) NOT NULL,
  description   VARCHAR(255),
  ip_address    VARCHAR(45),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── ORGANIZATION ──────────────────────────────────────────────────
CREATE TABLE departments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE doctors (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL,
  department_id      INT NULL,
  specialization     VARCHAR(120),
  qualification      VARCHAR(150),
  consultation_fee   DECIMAL(10,2) NOT NULL DEFAULT 0,
  schedule_days      VARCHAR(60)  DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  schedule_start     TIME DEFAULT '09:00:00',
  schedule_end       TIME DEFAULT '17:00:00',
  status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── PATIENTS ──────────────────────────────────────────────────────
CREATE TABLE patients (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NULL,                     -- linked portal login, if any
  mrn                VARCHAR(20) NOT NULL UNIQUE,   -- Medical Record Number, e.g. MRN-000001
  name               VARCHAR(120) NOT NULL,
  dob                DATE NULL,
  gender             ENUM('male','female','other') NOT NULL,
  blood_group        VARCHAR(5),
  phone              VARCHAR(30),
  email              VARCHAR(150),
  address            VARCHAR(255),
  emergency_contact  VARCHAR(120),
  allergies          VARCHAR(255),
  status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── APPOINTMENTS (OPD) ────────────────────────────────────────────
CREATE TABLE appointments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  patient_id         INT NOT NULL,
  doctor_id          INT NOT NULL,
  department_id      INT NULL,
  appointment_date   DATE NOT NULL,
  appointment_time   TIME NOT NULL,
  reason             VARCHAR(255),
  notes              TEXT,
  status             ENUM('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  created_by         INT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_appt_date (appointment_date),
  INDEX idx_appt_doctor_date (doctor_id, appointment_date)
) ENGINE=InnoDB;

-- ── WARDS, BEDS & ADMISSIONS (IPD) ────────────────────────────────
CREATE TABLE wards (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  type          ENUM('general','private','icu','emergency','maternity','pediatric') NOT NULL DEFAULT 'general',
  floor         VARCHAR(20),
  daily_charge  DECIMAL(10,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE beds (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ward_id       INT NOT NULL,
  bed_number    VARCHAR(20) NOT NULL,
  status        ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
  FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_ward_bed (ward_id, bed_number)
) ENGINE=InnoDB;

CREATE TABLE admissions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT NOT NULL,
  bed_id          INT NOT NULL,
  doctor_id       INT NOT NULL,
  admission_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discharge_date  DATETIME NULL,
  diagnosis       VARCHAR(255),
  notes           TEXT,
  status          ENUM('admitted','discharged') NOT NULL DEFAULT 'admitted',
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── PHARMACY ──────────────────────────────────────────────────────
CREATE TABLE medicines (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  generic_name   VARCHAR(150),
  category       VARCHAR(80),
  unit           VARCHAR(30) DEFAULT 'tablet',
  unit_price     DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level  INT NOT NULL DEFAULT 20,
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB;

CREATE TABLE medicine_stock (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id    INT NOT NULL,
  batch_no       VARCHAR(60),
  quantity       INT NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  expiry_date    DATE,
  received_date  DATE NOT NULL DEFAULT (CURRENT_DATE),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE prescriptions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NULL,
  patient_id     INT NOT NULL,
  doctor_id      INT NOT NULL,
  notes          TEXT,
  status         ENUM('pending','dispensed','cancelled') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE prescription_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  prescription_id  INT NOT NULL,
  medicine_id      INT NOT NULL,
  dosage           VARCHAR(60),   -- e.g. "500mg"
  frequency        VARCHAR(60),   -- e.g. "1-0-1"
  duration         VARCHAR(60),   -- e.g. "5 days"
  quantity         INT NOT NULL DEFAULT 1,
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── LABORATORY ────────────────────────────────────────────────────
CREATE TABLE lab_tests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  category      VARCHAR(80),
  price         DECIMAL(10,2) NOT NULL DEFAULT 0,
  normal_range  VARCHAR(100),
  unit          VARCHAR(30),
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB;

CREATE TABLE lab_orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT NOT NULL,
  doctor_id      INT NOT NULL,
  appointment_id INT NULL,
  order_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status         ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE lab_order_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  lab_order_id     INT NOT NULL,
  lab_test_id      INT NOT NULL,
  result_value     VARCHAR(150),
  result_notes     VARCHAR(255),
  status           ENUM('pending','completed') NOT NULL DEFAULT 'pending',
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── BILLING ───────────────────────────────────────────────────────
CREATE TABLE invoices (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number   VARCHAR(30) NOT NULL UNIQUE,
  patient_id       INT NOT NULL,
  appointment_id   INT NULL,
  admission_id     INT NULL,
  invoice_date     DATE NOT NULL DEFAULT (CURRENT_DATE),
  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax              DECIMAL(12,2) NOT NULL DEFAULT 0,
  total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid      DECIMAL(12,2) NOT NULL DEFAULT 0,
  status           ENUM('unpaid','partial','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  created_by       INT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id    INT NOT NULL,
  item_type     ENUM('consultation','medicine','lab_test','bed_charge','procedure','other') NOT NULL DEFAULT 'other',
  description   VARCHAR(255) NOT NULL,
  quantity      DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price    DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  payment_method  ENUM('cash','card','bank_transfer','insurance','online') NOT NULL DEFAULT 'cash',
  reference_no    VARCHAR(80),
  payment_date    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by     INT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── ACCOUNTING (basic double-entry ledger) ────────────────────────
CREATE TABLE accounts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  type        ENUM('asset','liability','equity','revenue','expense') NOT NULL,
  parent_id   INT NULL,
  FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  transaction_date  DATE NOT NULL DEFAULT (CURRENT_DATE),
  reference         VARCHAR(60),
  description       VARCHAR(255),
  created_by        INT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE transaction_entries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id  INT NOT NULL,
  account_id      INT NOT NULL,
  debit           DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit          DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── SETTINGS ──────────────────────────────────────────────────────
CREATE TABLE settings (
  setting_key    VARCHAR(60) PRIMARY KEY,
  setting_value  VARCHAR(255)
) ENGINE=InnoDB;

-- ── SESSION STORE TABLE (created automatically by express-mysql-session
--    on first run — no manual action needed) ─────────────────────────
