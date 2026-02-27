const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(
  process.env.APPDATA || process.env.HOME,
  'abu-kamil-pos', 'abu-kamil-pos.db'
);

const db = new Database(dbPath);
console.log('DB opened:', dbPath);

// 1. Count before
const before = db.prepare('SELECT COUNT(*) as c FROM bank_transactions').get();
console.log('Before cleanup:', before.c, 'records');

// 2. Disable FK
db.pragma('foreign_keys = OFF');

// 3. Clean child tables
try {
  const childResult = db.prepare(`
    DELETE FROM payment_installments
    WHERE bank_transaction_id IN (
      SELECT id FROM bank_transactions
      WHERE id NOT IN (
        SELECT MAX(id) FROM bank_transactions
        GROUP BY raw_description, ROUND(amount, 2), parsed_date
      )
      AND match_status IN ('pending', 'unmatched')
    )
  `).run();
  console.log('Child records cleaned:', childResult.changes);
} catch(e) {
  console.log('No child cleanup needed:', e.message);
}

// 4. Clean duplicates
const dupResult = db.prepare(`
  DELETE FROM bank_transactions
  WHERE id NOT IN (
    SELECT MAX(id) FROM bank_transactions
    GROUP BY raw_description, ROUND(amount, 2), parsed_date
  )
  AND match_status IN ('pending', 'unmatched')
`).run();
console.log('Duplicate records deleted:', dupResult.changes);

// 5. Re-enable FK
db.pragma('foreign_keys = ON');

// 6. Count after
const after = db.prepare('SELECT COUNT(*) as c FROM bank_transactions').get();
console.log('After cleanup:', after.c, 'records');

// 7. Show remaining
const remaining = db.prepare(`
  SELECT id, substr(payer_name, 1, 30) as name, amount, match_status, substr(transaction_hash, 1, 12) as hash_preview
  FROM bank_transactions
  ORDER BY id
`).all();
console.log('\nRemaining records:');
remaining.forEach(r => console.log(`  id=${r.id} | ${r.name} | ${r.amount} | ${r.match_status} | hash=${r.hash_preview}`));

db.close();