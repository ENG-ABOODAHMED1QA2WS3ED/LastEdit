const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

// حذف الدفعة المكررة 47
db.prepare("DELETE FROM payments WHERE id=47").run();
console.log("حذف دفعة 47");

// شوف الحالة النهائية
console.log("\n=== معلقة ===");
db.prepare("SELECT p.id, p.amount, p.method, p.status, c.name, c.alt_account_name FROM payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE p.status NOT IN ('confirmed','paid')").all().forEach(p => {
  console.log(p.id + " | " + p.name + " | " + p.amount + " | " + p.method + " | " + p.status + " | alt:" + p.alt_account_name);
});

db.pragma('foreign_keys = ON');
db.close();
process.exit();
