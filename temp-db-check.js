const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const appData = app.getPath('userData');
console.log('AppData: ' + appData);

const files = fs.readdirSync(appData);
console.log('Files: ' + files.join(', '));

const dbFile = files.find(f => f.endsWith('.db') && !f.includes('backup'));
const dbPath = path.join(appData, dbFile || 'abu-kamil-pos.db');
console.log('DB: ' + dbPath);

const Database = require('better-sqlite3');
const db = new Database(dbPath, { readonly: true });

const custCount = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
console.log('\nTotal customers: ' + custCount.cnt);

const payCount = db.prepare("SELECT COUNT(*) as cnt FROM payments WHERE match_status IS NULL OR match_status = 'pending'").get();
console.log('Pending payments: ' + payCount.cnt);

const customers = db.prepare('SELECT id, name FROM customers').all();
console.log('\n=== Customers with pending payments ===');
for (const c of customers) {
  const payments = db.prepare("SELECT id, amount, total_amount, match_status FROM payments WHERE customer_id = ? AND (match_status IS NULL OR match_status = 'pending')").all(c.id);
  if (payments.length > 0) {
    console.log('Customer: ' + c.name + ' (id=' + c.id + ') - ' + payments.length + ' pending:');
    payments.forEach(p => console.log('  #' + p.id + ': ' + (p.total_amount || p.amount) + ' status=' + p.match_status));
  }
}

const bankCount = db.prepare("SELECT COUNT(*) as cnt FROM bank_transactions WHERE match_status IS NULL OR match_status = 'pending'").get();
console.log('\nPending bank txns: ' + bankCount.cnt);

const bankSample = db.prepare("SELECT id, amount, payer_name FROM bank_transactions WHERE match_status IS NULL OR match_status = 'pending' LIMIT 10").all();
console.log('\nSample bank txns:');
bankSample.forEach(b => console.log('  #' + b.id + ': ' + b.amount + ' "' + (b.payer_name||'').substring(0,50) + '"'));

// Check for شريهان specifically
const sherihanBank = db.prepare("SELECT id, amount, payer_name FROM bank_transactions WHERE payer_name LIKE '%شريهان%' OR payer_name LIKE '%shereen%' OR payer_name LIKE '%SHEREEN%'").all();
console.log('\nBank txns with شريهان/shereen: ' + sherihanBank.length);
sherihanBank.forEach(b => console.log('  #' + b.id + ': ' + b.amount + ' "' + (b.payer_name||'').substring(0,60) + '" status=' + b.match_status));

db.close();
app.quit();
