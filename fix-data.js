const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

// ايقاف foreign keys مؤقتا
db.pragma('foreign_keys = OFF');

// مسح بالترتيب الصحيح
db.exec("DELETE FROM matching_attempts");
db.exec("DELETE FROM bank_transactions");
console.log("تم مسح البيانات المكررة");

// اعادة تفعيل
db.pragma('foreign_keys = ON');

// عرض الدفعات المعلقة
console.log("\n=== دفعات تحتاج مطابقة ===");
const pending = db.prepare(`
  SELECT p.id, p.invoice_id, p.method, p.status, p.amount, p.transfer_type,
         i.customer_id, c.name as customer_name, c.alt_account_name
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE (p.method = 'transfer' AND p.status IN ('awaiting_transfer','pending'))
     OR (p.method = 'debt' AND p.status = 'pending')
`).all();
pending.forEach(p => console.log(JSON.stringify(p)));
console.log("\nعدد الدفعات المعلقة:", pending.length);

db.close();
process.exit();
