const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = OFF');

// 1. مسح كل البيانات المكررة
db.exec("DELETE FROM matching_attempts");
db.exec("DELETE FROM bank_transactions");
console.log("1. تم مسح البيانات المكررة");

// 2. اضافة alias لاحمد ابوثريا (customer_id = 6)
db.exec("DELETE FROM customer_aliases WHERE customer_id = 6");
db.prepare("INSERT INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count) VALUES (?,?,?,?,?,?)").run(6, 'احمد نصار ابو ثريا', 'احمد نصار ابو ثريا', 'manual', 1.0, 0);
db.prepare("INSERT INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count) VALUES (?,?,?,?,?,?)").run(6, 'Ahmad Nassar Abu Thuraya', 'ahmad nassar abu thuraya', 'manual', 1.0, 0);
console.log("2. تم اضافة aliases لاحمد");

// 3. اعادة حالة الدفعة المكررة
// حذف الدفعة المكررة 300 اللي status=pending (id=?)
const dupPayment = db.prepare("SELECT id FROM payments WHERE invoice_id=26 AND method='transfer' AND status='pending'").get();
if (dupPayment) {
  db.prepare("DELETE FROM payments WHERE id=?").run(dupPayment.id);
  console.log("3. تم حذف الدفعة المكررة:", dupPayment.id);
}

// 4. تأكيد الوضع النهائي
console.log("\n=== الحالة بعد التنظيف ===");
db.prepare("SELECT p.id, p.amount, p.method, p.status, c.name FROM payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE p.status NOT IN ('confirmed','paid')").all().forEach(p => {
  console.log("  " + p.id + " | " + p.name + " | " + p.amount + " | " + p.method + " | " + p.status);
});

console.log("\n=== aliases ===");
db.prepare("SELECT * FROM customer_aliases").all().forEach(a => console.log("  " + a.customer_id + " | " + a.alias_name));

console.log("\n=== bank_transactions count:", db.prepare("SELECT COUNT(*) as c FROM bank_transactions").get().c);

db.pragma('foreign_keys = ON');
db.close();
process.exit();
