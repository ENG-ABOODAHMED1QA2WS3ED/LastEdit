const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

console.log('=== payments ===');
db.prepare('SELECT id, invoice_id, method, status, amount, transfer_type FROM payments').all().forEach(p => console.log(JSON.stringify(p)));

console.log('=== invoices ===');
db.prepare('SELECT id, customer_id, total, status FROM invoices').all().forEach(i => console.log(JSON.stringify(i)));

console.log('=== bank_transactions ===');
db.prepare('SELECT id, parsed_name, amount, match_status FROM bank_transactions').all().forEach(b => console.log(JSON.stringify(b)));

console.log('=== customers ===');
db.prepare('SELECT id, name, alt_account_name FROM customers').all().forEach(c => console.log(JSON.stringify(c)));

db.close();
process.exit();
