function runDiagnostics(db) {
  try {
    console.log('\n========== SYSTEM OVERVIEW ==========\n');

    // 1. Total customers
    const totalCust = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
    console.log('Total customers in system:', totalCust.cnt);

    // 2. All customers with names
    console.log('\n=== ALL CUSTOMERS ===');
    const allCusts = db.prepare('SELECT id, name, phone FROM customers ORDER BY id').all();
    allCusts.forEach(c => console.log('  #' + c.id + ': ' + c.name + ' | ' + (c.phone || 'no phone')));

    // 3. Bank transactions summary
    const bankStats = db.prepare('SELECT match_status, COUNT(*) as cnt FROM bank_transactions GROUP BY match_status').all();
    console.log('\n=== BANK TRANSACTIONS STATUS ===');
    bankStats.forEach(s => console.log('  ' + (s.match_status || 'null') + ': ' + s.cnt));

    // 4. Invoice summary
    const invStats = db.prepare('SELECT payment_status, COUNT(*) as cnt, SUM(total) as total_amount FROM invoices GROUP BY payment_status').all();
    console.log('\n=== INVOICES STATUS ===');
    invStats.forEach(s => console.log('  ' + s.payment_status + ': ' + s.cnt + ' invoices, total: ' + s.total_amount + ' ILS'));

    // 5. Sample pending bank transactions - show variety of names
    console.log('\n=== SAMPLE BANK TRANSACTIONS (first 30) ===');
    const sampleTxns = db.prepare("SELECT id, payer_name, amount FROM bank_transactions WHERE match_status = 'pending' ORDER BY id LIMIT 30").all();
    sampleTxns.forEach(t => console.log('  #' + t.id + ': ' + (t.payer_name || 'NO NAME').substring(0, 55) + ' | ' + t.amount + ' ILS'));

    // 6. Cross-match: ALL bank transactions vs ALL customers (not just unpaid)
    console.log('\n=== CROSS-MATCH: BANK vs ALL CUSTOMERS ===');
    const NN = require('./main/name-normalizer');
    const allTxns = db.prepare("SELECT id, payer_name, amount FROM bank_transactions WHERE match_status = 'pending'").all();
    
    let matchCount = 0;
    for (const cust of allCusts) {
      for (const tx of allTxns) {
        const payer = tx.payer_name || '';
        if (!payer || payer.length < 3) continue;
        const r = NN.calculateNameScore(payer, cust.name, []);
        if (r.score >= 70) {
          matchCount++;
          console.log('  MATCH: bank #' + tx.id + ' "' + payer.substring(0, 40) + '" (' + tx.amount + ' ILS) => Customer #' + cust.id + ' "' + cust.name + '" | Score: ' + r.score + ' | Method: ' + r.method);
        }
      }
    }
    console.log('Total matches (score >= 70) across ALL customers:', matchCount);

    console.log('\n========== OVERVIEW END ==========\n');
  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  }
}
module.exports = { runDiagnostics };
