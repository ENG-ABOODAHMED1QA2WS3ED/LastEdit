const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

console.log('=== كل العمليات البنكية ===');
db.prepare("SELECT id, parsed_name, amount, match_status FROM bank_transactions WHERE match_status='pending'").all().forEach(b => {
  console.log('  ' + b.parsed_name + ' | ' + b.amount + ' NIS | ' + b.match_status);
});

console.log('\n=== دفعات احمد المعلقة ===');
db.prepare("SELECT p.id, p.amount, p.method, p.status, c.name, c.alt_account_name FROM payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE c.name LIKE '%أحمد%'").all().forEach(p => {
  console.log('  ' + p.name + ' | ' + p.amount + ' | ' + p.method + ' | ' + p.status + ' | alt: ' + p.alt_account_name);
});

db.close();
process.exit();
