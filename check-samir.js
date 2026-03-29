const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA || '', 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== BANK TRANSACTIONS (سمير/samir/اسدودي) ===');
const bankTx = db.prepare("SELECT id, amount, payer_name, match_status, parsed_date FROM bank_transactions WHERE payer_name LIKE '%سمير%' OR payer_name LIKE '%samir%' OR payer_name LIKE '%اسدودي%'").all();
bankTx.forEach(t => console.log(`  id:${t.id} | amount:${t.amount} | status:${t.match_status} | payer:${t.payer_name}`));
console.log('  Total:', bankTx.length);

console.log('\n=== PAYMENTS (سمير) ===');
const payments = db.prepare("SELECT id, amount, total_amount, customer_name, invoice_id, status FROM payments WHERE customer_name LIKE '%سمير%'").all();
payments.forEach(p => console.log(`  id:${p.id} | amount:${p.amount} | total:${p.total_amount} | invoice:${p.invoice_id} | status:${p.status} | name:${p.customer_name}`));
console.log('  Total:', payments.length);

console.log('\n=== INVOICES (سمير) ===');
const invoices = db.prepare("SELECT id, total_amount, customer_name, payment_status FROM invoices WHERE customer_name LIKE '%سمير%'").all();
invoices.forEach(i => console.log(`  id:${i.id} | amount:${i.total_amount} | status:${i.payment_status} | name:${i.customer_name}`));
console.log('  Total:', invoices.length);

console.log('\n=== DEBTS (سمير) ===');
try {
    const debts = db.prepare("SELECT id, amount, customer_name, status, method, notes FROM debts WHERE customer_name LIKE '%سمير%'").all();
    debts.forEach(d => console.log(`  id:${d.id} | amount:${d.amount} | status:${d.status} | method:${d.method} | name:${d.customer_name}`));
    console.log('  Total:', debts.length);
} catch(e) { console.log('  Error:', e.message); }

db.close();
