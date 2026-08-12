// ── database/seed.js ──────────────────────────────────────────────
// Populates demo data: 1 admin, 1 receptionist, 2 doctors, a handful
// of patients (incl. one with a portal login), departments, a ward
// with beds, a small medicine/lab catalog, and a basic chart of
// accounts so the accounting module has something to post against.
//
// Run with: npm run seed   (after schema.sql has been imported)

require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("../config/db");

async function seed() {
  console.log("🌱  Seeding MediCore HMS demo data...");
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ── Wipe existing demo data (safe order respecting FKs) ─────────
    const tables = [
      "transaction_entries", "transactions", "payments", "invoice_items", "invoices",
      "lab_order_items", "lab_orders", "lab_tests", "prescription_items", "prescriptions",
      "medicine_stock", "medicines", "admissions", "beds", "wards", "appointments",
      "doctors", "patients", "departments", "accounts", "activity_logs", "settings", "users",
    ];
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of tables) await conn.query(`TRUNCATE TABLE ${t}`);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    // ── Users: admin, receptionist ───────────────────────────────────
    const [admin] = await conn.query(
      "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'admin', ?)",
      ["System Administrator", "admin", "admin@medicore.local", hash("Admin@123"), "0300-0000000"]
    );
    const [reception] = await conn.query(
      "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'receptionist', ?)",
      ["Sara Khan", "reception", "reception@medicore.local", hash("Reception@123"), "0300-1111111"]
    );

    // ── Departments ───────────────────────────────────────────────
    const [cardiology] = await conn.query("INSERT INTO departments (name, description) VALUES ('Cardiology', 'Heart and cardiovascular care')");
    const [pediatrics] = await conn.query("INSERT INTO departments (name, description) VALUES ('Pediatrics', 'Child healthcare')");
    await conn.query("INSERT INTO departments (name, description) VALUES ('General Medicine', 'General outpatient care')");
    await conn.query("INSERT INTO departments (name, description) VALUES ('Orthopedics', 'Bone and joint care')");

    // ── Doctors ───────────────────────────────────────────────────
    const [docUser1] = await conn.query(
      "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'doctor', ?)",
      ["Ahmed Raza", "dr.ahmed", "ahmed.raza@medicore.local", hash("Doctor@123"), "0300-2222222"]
    );
    const [doc1] = await conn.query(
      `INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee, schedule_days, schedule_start, schedule_end)
       VALUES (?, ?, 'Cardiologist', 'MBBS, FCPS (Cardiology)', 2000, 'Mon,Tue,Wed,Thu,Fri', '09:00', '17:00')`,
      [docUser1.insertId, cardiology.insertId]
    );

    const [docUser2] = await conn.query(
      "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'doctor', ?)",
      ["Ayesha Malik", "dr.ayesha", "ayesha.malik@medicore.local", hash("Doctor@123"), "0300-3333333"]
    );
    const [doc2] = await conn.query(
      `INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee, schedule_days, schedule_start, schedule_end)
       VALUES (?, ?, 'Pediatrician', 'MBBS, DCH', 1500, 'Mon,Wed,Fri', '10:00', '16:00')`,
      [docUser2.insertId, pediatrics.insertId]
    );

    // ── Patients (one with portal login) ──────────────────────────
    const [patientUser] = await conn.query(
      "INSERT INTO users (name, username, email, password, role, phone) VALUES (?, ?, ?, ?, 'patient', ?)",
      ["Bilal Hussain", "bilal.h", "bilal.hussain@example.com", hash("Patient@123"), "0301-4444444"]
    );
    const [p1] = await conn.query(
      `INSERT INTO patients (user_id, mrn, name, dob, gender, blood_group, phone, email, address, emergency_contact)
       VALUES (?, 'MRN-000001', 'Bilal Hussain', '1990-05-14', 'male', 'B+', '0301-4444444', 'bilal.hussain@example.com', 'Kohat, KPK', 'Sana Hussain - 0301-5555555')`,
      [patientUser.insertId]
    );
    const [p2] = await conn.query(
      `INSERT INTO patients (mrn, name, dob, gender, blood_group, phone, address)
       VALUES ('MRN-000002', 'Fatima Noor', '1985-11-02', 'female', 'O+', '0302-6666666', 'Peshawar, KPK')`
    );
    const [p3] = await conn.query(
      `INSERT INTO patients (mrn, name, dob, gender, blood_group, phone, address)
       VALUES ('MRN-000003', 'Zainab Ali', '2015-03-20', 'female', 'A+', '0303-7777777', 'Kohat, KPK')`
    );

    // ── Wards & Beds ──────────────────────────────────────────────
    const [wardGeneral] = await conn.query("INSERT INTO wards (name, type, floor, daily_charge) VALUES ('General Ward A', 'general', '1st Floor', 1500)");
    const [wardIcu] = await conn.query("INSERT INTO wards (name, type, floor, daily_charge) VALUES ('ICU', 'icu', '2nd Floor', 8000)");
    for (let i = 1; i <= 8; i++) {
      await conn.query("INSERT INTO beds (ward_id, bed_number, status) VALUES (?, ?, 'available')", [wardGeneral.insertId, String(i).padStart(2, "0")]);
    }
    for (let i = 1; i <= 4; i++) {
      await conn.query("INSERT INTO beds (ward_id, bed_number, status) VALUES (?, ?, 'available')", [wardIcu.insertId, String(i).padStart(2, "0")]);
    }

    // ── Medicines + stock ─────────────────────────────────────────
    const meds = [
      ["Paracetamol", "Acetaminophen", "Analgesic", "tablet", 2.5, 100],
      ["Amoxicillin", "Amoxicillin", "Antibiotic", "capsule", 8.0, 50],
      ["Metformin", "Metformin HCl", "Antidiabetic", "tablet", 5.0, 60],
      ["Losartan", "Losartan Potassium", "Antihypertensive", "tablet", 6.5, 40],
      ["Cough Syrup", "Dextromethorphan", "Cold & Flu", "bottle", 120.0, 15],
    ];
    for (const [name, generic, category, unit, price, reorder] of meds) {
      const [m] = await conn.query(
        "INSERT INTO medicines (name, generic_name, category, unit, unit_price, reorder_level) VALUES (?, ?, ?, ?, ?, ?)",
        [name, generic, category, unit, price, reorder]
      );
      await conn.query(
        "INSERT INTO medicine_stock (medicine_id, batch_no, quantity, purchase_price, expiry_date) VALUES (?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 18 MONTH))",
        [m.insertId, `B-${1000 + m.insertId}`, reorder * 3, price * 0.6]
      );
    }

    // ── Lab tests ─────────────────────────────────────────────────
    const tests = [
      ["Complete Blood Count (CBC)", "Hematology", 800, "4.5-11.0", "x10^9/L"],
      ["Blood Sugar (Fasting)", "Biochemistry", 400, "70-100", "mg/dL"],
      ["Lipid Profile", "Biochemistry", 1500, "<200", "mg/dL"],
      ["Liver Function Test (LFT)", "Biochemistry", 1800, "varies", "U/L"],
      ["Urine Routine Examination", "Pathology", 350, "normal", "—"],
    ];
    for (const [name, category, price, range, unit] of tests) {
      await conn.query("INSERT INTO lab_tests (name, category, price, normal_range, unit) VALUES (?, ?, ?, ?, ?)", [name, category, price, range, unit]);
    }

    // ── Sample appointments ──────────────────────────────────────
    await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, reason, status, created_by)
       VALUES (?, ?, ?, CURDATE(), '10:30:00', 'Routine checkup', 'scheduled', ?)`,
      [p1.insertId, doc1.insertId, cardiology.insertId, admin.insertId]
    );
    await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, reason, status, created_by)
       VALUES (?, ?, ?, CURDATE(), '11:00:00', 'Fever and cough', 'scheduled', ?)`,
      [p3.insertId, doc2.insertId, pediatrics.insertId, reception.insertId]
    );

    // ── Chart of Accounts ─────────────────────────────────────────
    const accounts = [
      ["1000", "Cash", "asset"], ["1100", "Accounts Receivable", "asset"],
      ["1200", "Medical Inventory", "asset"], ["2000", "Accounts Payable", "liability"],
      ["3000", "Owner's Equity", "equity"], ["4000", "Patient Revenue", "revenue"],
      ["4100", "Pharmacy Revenue", "revenue"], ["5000", "Salaries Expense", "expense"],
      ["5100", "Medical Supplies Expense", "expense"], ["5200", "Utilities Expense", "expense"],
    ];
    for (const [code, name, type] of accounts) {
      await conn.query("INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)", [code, name, type]);
    }

    // ── Default settings ──────────────────────────────────────────
    await conn.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES
       ('hospital_name', 'MediCore Hospital'), ('hospital_address', 'Kohat, Khyber Pakhtunkhwa, Pakistan'),
       ('hospital_phone', '051-1234567'), ('currency_symbol', 'Rs. '),
       ('invoice_footer_note', 'Thank you for choosing MediCore Hospital.')`
    );

    await conn.commit();

    console.log("✅  Seed complete!\n");
    console.log("─".repeat(55));
    console.log("  DEMO LOGINS");
    console.log("─".repeat(55));
    console.log("  Admin          admin / Admin@123");
    console.log("  Receptionist   reception / Reception@123");
    console.log("  Doctor         dr.ahmed / Doctor@123");
    console.log("  Doctor         dr.ayesha / Doctor@123");
    console.log("  Patient portal bilal.h / Patient@123");
    console.log("─".repeat(55));

  } catch (err) {
    await conn.rollback();
    console.error("❌  Seed failed:", err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

seed();
