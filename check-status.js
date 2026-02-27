const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

console.log('=== دفعات غير مؤكدة ===');
db.prepare("SELECT p.id, p.invoice_id, p.method, p.status, p.amount, c.name FROM payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE p.status NOT IN ('confirmed','paid')").all().forEach(p => console.log(JSON.stringify(p)));

console.log('\n=== matching_attempts ===');
db.prepare("SELECT * FROM matching_attempts").all().forEach(a => console.log(JSON.stringify(a)));

console.log('\n=== bank matched ===');
db.prepare("SELECT id, parsed_name, amount, match_status FROM bank_transactions WHERE match_status != 'pending'").all().forEach(b => console.log(JSON.stringify(b)));

db.close();
process.exit();
