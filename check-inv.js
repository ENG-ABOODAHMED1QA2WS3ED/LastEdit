const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

console.log('=== invoices >= 26 ===');
db.prepare("SELECT id, customer_id, total, status FROM invoices WHERE id >= 26").all().forEach(i => console.log(JSON.stringify(i)));

console.log('\n=== payments for invoices >= 26 ===');
db.prepare("SELECT id, invoice_id, method, status, amount FROM payments WHERE invoice_id >= 26").all().forEach(p => console.log(JSON.stringify(p)));

console.log('\n=== totals ===');
console.log('invoices:', db.prepare("SELECT COUNT(*) as c FROM invoices").get().c);
console.log('payments:', db.prepare("SELECT COUNT(*) as c FROM payments").get().c);

db.close();
process.exit();
