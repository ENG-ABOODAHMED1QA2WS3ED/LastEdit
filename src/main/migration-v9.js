/**
 * Migration v9 - جداول المطابقة المتقدمة
 */
function runMigrationV9(db) {
  let added = 0, skipped = 0;

  // 1. أعمدة جديدة
  const columns = [
    { table: 'debts', col: 'is_shortage', type: 'INTEGER DEFAULT 0' },
    { table: 'debts', col: 'related_payment_id', type: 'INTEGER' },
    { table: 'debts', col: 'related_bank_transaction_id', type: 'INTEGER' },
    { table: 'customers', col: 'alt_account_name', type: 'TEXT' },
    { table: 'customers', col: 'phone', type: 'TEXT' }
  ];

  for (const { table, col, type } of columns) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      added++;
      console.log(`  [v9] Added ${table}.${col}`);
    } catch (e) {
      skipped++;
    }
  }

  // 2. جداول جديدة
  const tables = [
    `CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      bank_transaction_id INTEGER,
      amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS grouped_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      bank_transaction_id INTEGER NOT NULL,
      payment_ids TEXT NOT NULL,
      total_amount REAL NOT NULL,
      payments_count INTEGER NOT NULL,
      confidence INTEGER,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      reversed_at TEXT,
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS customer_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      remaining_amount REAL NOT NULL,
      reason TEXT,
      related_bank_transaction_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      used_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`
  ];

  for (const sql of tables) {
    try {
      db.exec(sql);
      added++;
    } catch (e) {
      skipped++;
    }
  }

  // 3. فهارس
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_installments_payment ON installments(payment_id)',
    'CREATE INDEX IF NOT EXISTS idx_installments_bank ON installments(bank_transaction_id)',
    'CREATE INDEX IF NOT EXISTS idx_grouped_group ON grouped_matches(group_id)',
    'CREATE INDEX IF NOT EXISTS idx_grouped_bank ON grouped_matches(bank_transaction_id)',
    'CREATE INDEX IF NOT EXISTS idx_credits_customer ON customer_credits(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_credits_active ON customer_credits(customer_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_debts_shortage ON debts(is_shortage)'
  ];

  for (const sql of indexes) {
    try {
      db.exec(sql);
    } catch (e) {}
  }

  return { added, skipped };
}

module.exports = { runMigrationV9 };
