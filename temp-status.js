const { app } = require('electron');
app.whenReady().then(() => {
  const path = require('path');
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'abu-kamil-pos.db');
  console.log('DB: ' + dbPath);
  const db = new Database(dbPath, { readonly: true });

  console.log('=== SHERIHAN PAYMENTS ===');
  const shePays = db.prepare(`
    SELECT p.id, p.amount, p.status, p.method, p.paid_amount, p.remaining_amount,
           i.total as inv_total, c.name as cust_name
    FROM payments p JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE c.name LIKE '%شريهان%' OR c.name LIKE '%شريهن%'
  `).all();
  shePays.forEach(p => console.log('  pay#'+p.id+' amt='+p.amount+' status='+p.status+' method='+p.method+' paid='+p.paid_amount+' remain='+p.remaining_amount));
  console.log('Total: ' + shePays.length);

  console.log('\n=== BANK #8469 STATUS ===');
  const b8469 = db.prepare('SELECT id,amount,match_status,matched_payment_id FROM bank_transactions WHERE id=8469').get();
  if(b8469) console.log('  bank#'+b8469.id+' amt='+b8469.amount+' status='+b8469.match_status+' matched='+b8469.matched_payment_id);
  else console.log('  NOT FOUND');

  console.log('\n=== PENDING BANK TXNS AMOUNT=12 ===');
  const b12 = db.prepare("SELECT id,amount,match_status,payer_name FROM bank_transactions WHERE amount=12 AND match_status='pending' LIMIT 10").all();
  b12.forEach(b => console.log('  bank#'+b.id+' payer="'+(b.payer_name||'').substring(0,50)+'"'));
  console.log('Total: ' + b12.length);

  console.log('\n=== ENGINE PENDING PAYMENTS ===');
  const eng = db.prepare(`
    SELECT p.id, p.amount as total_amount, p.status, p.method, c.name as customer_name, i.customer_id
    FROM payments p JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE p.method IN ('transfer','wallet','debt')
    AND (p.status IN ('pending','pending_match','awaiting_transfer') OR (p.status='partial' AND p.paid_amount=0))
    ORDER BY p.created_at DESC
  `).all();
  console.log('Total pending: ' + eng.length);
  eng.forEach(p => console.log('  pay#'+p.id+' amt='+p.total_amount+' status='+p.status+' method='+p.method+' custId='+p.customer_id));

  db.close();
  app.quit();
});
