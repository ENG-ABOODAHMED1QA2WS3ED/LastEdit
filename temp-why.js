const { app } = require('electron');
app.setPath('userData', require('path').join(process.env.APPDATA, 'abu-kamil-pos'));
app.whenReady().then(() => {
  const Database = require('better-sqlite3');
  const db = new Database(require('path').join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db'), {readonly:true});

  // 1. Why is pay#107 used? Check if Layer 0/1 consumed it
  console.log('=== PAY#107 STATUS ===');
  const p107 = db.prepare('SELECT id,amount,status,method,paid_amount,match_reference FROM payments WHERE id=107').get();
  console.log(JSON.stringify(p107));

  // 2. Bank#8928 status
  console.log('\n=== BANK#8928 STATUS ===');
  const b8928 = db.prepare('SELECT id,amount,match_status,matched_payment_id FROM bank_transactions WHERE id=8928').get();
  console.log(JSON.stringify(b8928));

  // 3. What is accountOwner value?
  console.log('\n=== ACCOUNT OWNER ===');
  const owner = db.prepare("SELECT value FROM settings WHERE key='account_owner_name'").get();
  console.log('account_owner_name: ' + JSON.stringify(owner));
  const owner2 = db.prepare("SELECT * FROM settings WHERE key LIKE '%owner%'").all();
  console.log('all owner settings: ' + JSON.stringify(owner2));

  // 4. All settings
  console.log('\n=== ALL SETTINGS ===');
  db.prepare("SELECT key,value FROM settings").all().forEach(s => console.log('  ' + s.key + ' = ' + (s.value||'').substring(0,60)));

  // 5. Check matched_payments or learning table
  console.log('\n=== MATCHED PAYMENTS (last 10) ===');
  try {
    db.prepare("SELECT * FROM matched_payments ORDER BY id DESC LIMIT 10").all().forEach(m => console.log('  ' + JSON.stringify(m)));
  } catch(e) { console.log('  table not found: ' + e.message); }

  // 6. Check if pay#107 was matched by reference
  console.log('\n=== BANK TXNS MATCHED TO PAY 107 ===');
  const matched107 = db.prepare("SELECT id,amount,match_status,matched_payment_id FROM bank_transactions WHERE matched_payment_id=107 OR matched_payment_id LIKE '%107%'").all();
  console.log(JSON.stringify(matched107));

  db.close();
  app.quit();
});
