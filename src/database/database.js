/**
 * database.js  –  Abu-Kamil POS
 *
 * Exports (primary names used by main.js):
 *   initializeDatabase(dbPath?) → db
 *   getDatabase()               → db
 *   closeDatabase()             → void
 *
 * Backward-compat aliases:
 *   initDatabase  = initializeDatabase
 *   getDb         = getDatabase
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const { app }  = require('electron');
const { calculateTransactionHash } = require('../utils/transaction-hash');

let _db = null;

// ══════════════════════════════════════════════════════════════════════════════
//  LOW-LEVEL HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * SQLite ALTER TABLE rejects DEFAULT (datetime('now')).
 * Strip it → DEFAULT NULL so the ALTER always succeeds.
 */
function safeDef(def) {
  return def
    .replace(/NOT NULL\s+DEFAULT\s+\(datetime\('now'\)\)/gi, 'DEFAULT NULL')
    .replace(/DEFAULT\s+\(datetime\('now'\)\)/gi,            'DEFAULT NULL')
    .replace(/NOT NULL\s+DEFAULT\s+\(date\('now'\)\)/gi,    'DEFAULT NULL')
    .replace(/DEFAULT\s+\(date\('now'\)\)/gi,                'DEFAULT NULL');
}

/** Add a column only if it does not exist yet. */
function addCol(db, table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
    if (cols.some(c => c.name === column)) return;   // already there
    db.prepare(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${safeDef(definition)}`).run();
    console.log(`[DB] Added column ${table}.${column}`);
  } catch (err) {
    // column may have been added by a concurrent process – ignore
    if (!err.message.includes('duplicate column')) {
      console.error(`[DB] addCol(${table}.${column}):`, err.message);
    }
  }
}

function tableExists(db, name) {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
  ).get(name);
}

function indexExists(db, name) {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`
  ).get(name);
}

// ── Migrations tracking (independent of store_settings schema) ────────────
function ensureMigrationsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

function migrationDone(db, name) {
  return !!db.prepare(`SELECT 1 FROM _migrations WHERE name=?`).get(name);
}

function markMigrationDone(db, name) {
  db.prepare(
    `INSERT OR IGNORE INTO _migrations (name) VALUES (?)`
  ).run(name);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCHEMA CREATION  (CREATE TABLE IF NOT EXISTS)
// ══════════════════════════════════════════════════════════════════════════════

function createCoreTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'cashier',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      sku         TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id),
      price       REAL NOT NULL DEFAULT 0,
      stock       INTEGER NOT NULL DEFAULT 0,
      barcode     TEXT,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  // customers – includes is_home_transfer (used by matching-engine joins)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      phone           TEXT,
      email           TEXT,
      address         TEXT,
      notes           TEXT,
      is_home_transfer INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS invoices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      total       REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'pending',
      notes       TEXT,
      created_by  INTEGER REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      quantity   INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total      REAL NOT NULL DEFAULT 0
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id       INTEGER REFERENCES invoices(id),
      amount           REAL NOT NULL DEFAULT 0,
      method           TEXT NOT NULL DEFAULT 'cash',
      status           TEXT NOT NULL DEFAULT 'pending',
      bank_reference   TEXT,
      alt_account_name TEXT,
      customer_id      INTEGER REFERENCES customers(id),
      paid_amount      REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      total_amount     REAL NOT NULL DEFAULT 0,
      is_home_transfer INTEGER NOT NULL DEFAULT 0,
      transfer_type    TEXT,
      deadline_hours   INTEGER,
      deadline_at      TEXT,
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS store_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

// ── bank_transactions ────────────────────────────────────────────────────────
function createBankTransactionsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_date              TEXT,
      raw_description       TEXT,
      raw_amount            TEXT,
      parsed_date           TEXT,
      parsed_name           TEXT,
      normalized_name       TEXT,
      amount                REAL,
      direction             TEXT,
      transfer_type         TEXT,
      source_bank           TEXT,
      reference_number      TEXT,
      import_batch_id       TEXT,
      import_date           TEXT DEFAULT (datetime('now')),
      file_name             TEXT,
      row_number            INTEGER,
      match_status          TEXT NOT NULL DEFAULT 'pending',
      transaction_hash      TEXT,
      tx_reference          TEXT,
      payer_name            TEXT,
      payer_name_normalized TEXT,
      wallet_alias          TEXT,
      name_candidates_json  TEXT,
      transaction_type      TEXT,
      hash_v2               TEXT,
      matched_payment_id    INTEGER,
      updated_at            TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ── payment_installments ─────────────────────────────────────────────────────
function createPaymentInstallmentsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS payment_installments (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id          INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
      amount              REAL NOT NULL DEFAULT 0,
      installment_date    TEXT NOT NULL DEFAULT (date('now')),
      notes               TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

// ── name_learning ────────────────────────────────────────────────────────────
function createNameLearningTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS name_learning (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      payer_name_pattern TEXT NOT NULL,
      customer_id        INTEGER REFERENCES customers(id),
      customer_name      TEXT NOT NULL DEFAULT '',
      confidence         REAL NOT NULL DEFAULT 100,
      use_count          INTEGER NOT NULL DEFAULT 1,
      confirmed_by       TEXT NOT NULL DEFAULT 'manual',
      last_used_at       TEXT DEFAULT NULL,
      created_at         TEXT DEFAULT NULL,
      UNIQUE (payer_name_pattern, customer_id)
    )
  `).run();


  // Fix: add bank_name_raw column if missing
  try { db.prepare("ALTER TABLE name_learning ADD COLUMN bank_name_raw TEXT DEFAULT NULL").run(); } catch(e) { /* exists */ }
  try { db.prepare("ALTER TABLE name_learning ADD COLUMN bank_name_normalized TEXT DEFAULT NULL").run(); } catch(e) { /* exists */ }
  /*
   * IMPORTANT: matching-engine uses
   *   ON CONFLICT(payer_name_pattern, customer_id) DO UPDATE …
   * This requires a DIRECT UNIQUE constraint on those two columns
   * (not a functional/expression index). The UNIQUE clause above
   * handles NULL customer_id correctly in SQLite ≥ 3.25 via
   * partial-index semantics on UNIQUE constraints.
   * We do NOT create a separate expression index here.
   */
}

// ══════════════════════════════════════════════════════════════════════════════
//  COLUMN MIGRATIONS  (ALTER TABLE – run every startup, idempotent)
// ══════════════════════════════════════════════════════════════════════════════

function runColumnMigrations(db) {
  // ── users ──────────────────────────────────────────────────────────────────
  // The DB may have been created before 'password' was added to the schema
  addCol(db, 'users', 'password', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'users', 'role',     "TEXT NOT NULL DEFAULT 'cashier'");
  // Ensure existing rows have a usable password (plain-text defaults)
  db.prepare(`
    UPDATE users SET password = 'admin123'
    WHERE (password = '' OR password IS NULL) AND username = 'admin'
  `).run();
  db.prepare(`
    UPDATE users SET password = 'cashier123'
    WHERE (password = '' OR password IS NULL) AND username != 'admin'
  `).run();

  // ── bank_transactions ────────────────────────────────────────────────────
  addCol(db, 'bank_transactions', 'matched_payment_id',    'INTEGER');
  addCol(db, 'bank_transactions', 'updated_at',            'TEXT DEFAULT NULL');
  addCol(db, 'bank_transactions', 'hash_v2',               'TEXT');
  addCol(db, 'bank_transactions', 'wallet_alias',          'TEXT');
  addCol(db, 'bank_transactions', 'name_candidates_json',  'TEXT');
  addCol(db, 'bank_transactions', 'transaction_type',      'TEXT');
  addCol(db, 'bank_transactions', 'payer_name',            'TEXT');
  addCol(db, 'bank_transactions', 'payer_name_normalized', 'TEXT');
  addCol(db, 'bank_transactions', 'tx_reference',          'TEXT');

  // ── payments ─────────────────────────────────────────────────────────────
  addCol(db, 'payments', 'updated_at',       'TEXT DEFAULT NULL');
  addCol(db, 'payments', 'paid_amount',      'REAL NOT NULL DEFAULT 0');
  addCol(db, 'payments', 'remaining_amount', 'REAL NOT NULL DEFAULT 0');
  addCol(db, 'payments', 'total_amount',     'REAL NOT NULL DEFAULT 0');
  addCol(db, 'payments', 'is_home_transfer', 'INTEGER NOT NULL DEFAULT 0');
  addCol(db, 'payments', 'transfer_type',    'TEXT');
  addCol(db, 'payments', 'deadline_hours',   'INTEGER');
  addCol(db, 'payments', 'deadline_at',      'TEXT');
  addCol(db, 'payments', 'customer_id',      'INTEGER');
  addCol(db, 'payments', 'alt_account_name', 'TEXT');
  addCol(db, 'payments', 'bank_reference',   'TEXT');
  addCol(db, 'payments', 'notes',            'TEXT');

  // ── customers ─────────────────────────────────────────────────────────────
  // matching-engine JOINs customers.is_home_transfer
  addCol(db, 'customers', 'is_home_transfer', 'INTEGER NOT NULL DEFAULT 0');

  // ── payment_installments ─────────────────────────────────────────────────
  // The table may have been created by an older migration without these columns
  addCol(db, 'payment_installments', 'installment_date',    'TEXT DEFAULT NULL');
  addCol(db, 'payment_installments', 'bank_transaction_id', 'INTEGER');
  addCol(db, 'payment_installments', 'amount',              'REAL NOT NULL DEFAULT 0');
  addCol(db, 'payment_installments', 'notes',               'TEXT');
  addCol(db, 'payment_installments', 'created_at',          'TEXT DEFAULT NULL');

  // ── name_learning ─────────────────────────────────────────────────────────
  addCol(db, 'name_learning', 'payer_name_pattern', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'name_learning', 'customer_id',        'INTEGER');
  addCol(db, 'name_learning', 'customer_name',      "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'name_learning', 'confidence',         'REAL NOT NULL DEFAULT 100');
  addCol(db, 'name_learning', 'use_count',          'INTEGER NOT NULL DEFAULT 1');
  addCol(db, 'name_learning', 'confirmed_by',       "TEXT NOT NULL DEFAULT 'manual'");
  addCol(db, 'name_learning', 'last_used_at',       'TEXT DEFAULT NULL');
}

// ══════════════════════════════════════════════════════════════════════════════
//  INDEXES
// ══════════════════════════════════════════════════════════════════════════════

function applyIndexes(db) {
  // Drop legacy / conflicting indexes
  for (const idx of [
    'idx_bank_tx_unique',
    'idx_bank_tx_hash_v2',
    'idx_bank_tx_reference',
    'idx_bank_tx_reference_unique',
    'idx_name_learning_pattern_customer',   // was expression-based – drop & recreate
  ]) {
    if (indexExists(db, idx)) {
      db.prepare(`DROP INDEX IF EXISTS "${idx}"`).run();
      console.log(`[DB] Dropped legacy index: ${idx}`);
    }
  }

  // Unique hash index
  if (!indexExists(db, 'idx_bank_tx_hash_unique')) {
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_hash_unique
        ON bank_transactions (transaction_hash)
        WHERE transaction_hash IS NOT NULL
    `).run();
  }

  // Non-unique tx_reference index
  if (!indexExists(db, 'idx_bank_tx_ref')) {
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_bank_tx_ref
        ON bank_transactions (tx_reference)
        WHERE tx_reference IS NOT NULL
    `).run();
  }

  if (!indexExists(db, 'idx_bank_tx_status')) {
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_bank_tx_status
        ON bank_transactions (match_status)
    `).run();
  }

  if (!indexExists(db, 'idx_bank_tx_parsed_date')) {
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_bank_tx_parsed_date
        ON bank_transactions (parsed_date)
    `).run();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ONE-TIME CLEANUP  (tracked via _migrations, NOT store_settings)
// ══════════════════════════════════════════════════════════════════════════════

function runOneTimeCleanup(db) {
  const MIG = 'cleanup_v4';
  if (migrationDone(db, MIG)) return;

  console.log('[DB] Running one-time cleanup (v4)…');
  db.prepare('PRAGMA foreign_keys = OFF').run();

  try {
    // 1. Clear payment_installments
    if (tableExists(db, 'payment_installments')) {
      const r = db.prepare('DELETE FROM payment_installments').run();
      console.log(`[DB] Cleared payment_installments: ${r.changes} rows`);
    }

    // 2. Reset match_status and matched_payment_id for all rows
    db.prepare(`
      UPDATE bank_transactions
         SET match_status       = 'pending',
             matched_payment_id = NULL
    `).run();

    // 3. Delete duplicates – keep MAX(id) per (amount, description, date)
    db.prepare(`
      DELETE FROM bank_transactions
       WHERE id NOT IN (
         SELECT MAX(id)
           FROM bank_transactions
          GROUP BY ROUND(amount, 2),
                   substr(COALESCE(raw_description, ''), 1, 80),
                   COALESCE(parsed_date, raw_date, '')
       )
    `).run();

    // 4. Recalculate transaction_hash for all remaining rows
    const rows = db.prepare(
      `SELECT id, raw_date, parsed_date, amount, raw_description, reference_number
         FROM bank_transactions`
    ).all();

    const updHash = db.prepare(
      `UPDATE bank_transactions SET transaction_hash = ? WHERE id = ?`
    );

    let rehashed = 0;
    db.transaction(() => {
      for (const row of rows) {
        try {
          const h = calculateTransactionHash({
            date:            row.parsed_date || row.raw_date || '',
            amount:          row.amount       || 0,
            raw_description: row.raw_description || '',
            reference:       row.reference_number || null,
          });
          updHash.run(h, row.id);
          rehashed++;
        } catch (e) {
          console.warn(`[DB] Hash recalc failed id=${row.id}:`, e.message);
        }
      }
    })();

    console.log(`[DB] Rehashed ${rehashed} rows`);
    markMigrationDone(db, MIG);

    const after = db.prepare('SELECT COUNT(*) AS c FROM bank_transactions').get();
    console.log(`[DB] Cleanup done. Records after: ${after.c}`);

  } catch (err) {
    console.error('[DB] One-time cleanup error:', err.message);
    // Do NOT mark done – retry on next startup
  } finally {
    db.prepare('PRAGMA foreign_keys = ON').run();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SEED DATA
// ══════════════════════════════════════════════════════════════════════════════

function seedInitialData(db) {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    db.prepare(`
      INSERT INTO users (username, password, role)
      VALUES ('admin','admin123','admin'), ('cashier','cashier123','cashier')
    `).run();
    console.log('[DB] Seeded users');
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM categories').get().c === 0) {
    const ins = db.prepare(
      `INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`
    );
    db.transaction(() => [
      ['مواد غذائية',     'منتجات الغذاء والمشروبات'],
      ['مستلزمات منزلية', 'أدوات ومستلزمات المنزل'],
      ['إلكترونيات',      'أجهزة ومعدات إلكترونية'],
      ['ملابس',           'ملابس وأزياء'],
      ['أخرى',            'منتجات متنوعة'],
    ].forEach(c => ins.run(...c)))();
    console.log('[DB] Seeded categories');
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM store_settings').get().c === 0) {
    const ins = db.prepare(
      `INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)`
    );
    db.transaction(() => [
      ['store_name',     'Abu-Kamil POS'],
      ['currency',       'ILS'],
      ['tax_rate',       '0'],
      ['receipt_footer', 'شكراً لزيارتكم'],
    ].forEach(s => ins.run(...s)))();
    console.log('[DB] Seeded store settings');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

function initializeDatabase(dbPath) {
  if (_db) return _db;

  const resolvedPath = dbPath || path.join(
    app.getPath('userData'), 'abu-kamil-pos.db'
  );

  console.log('[DB] Opening database:', resolvedPath);
  _db = new Database(resolvedPath);

  _db.prepare('PRAGMA journal_mode = WAL').run();
  _db.prepare('PRAGMA foreign_keys = ON').run();
  _db.prepare('PRAGMA synchronous = NORMAL').run();

  // Order matters: migrations table first, then schema, then alter, then index
  ensureMigrationsTable(_db);
  createCoreTables(_db);
  createBankTransactionsTable(_db);
  createPaymentInstallmentsTable(_db);
  createNameLearningTable(_db);
  runColumnMigrations(_db);   // ALTER TABLE – fills gaps in existing DBs
  applyIndexes(_db);
  seedInitialData(_db);
  runOneTimeCleanup(_db);     // one-time dedup + rehash

  console.log('[DB] Initialisation complete');
  return _db;
}

function getDatabase() {
  if (!_db) throw new Error('[DB] Not initialised – call initializeDatabase() first');
  return _db;
}

function closeDatabase() {
  if (_db) {
    _db.close();
    _db = null;
    console.log('[DB] Closed');
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  // backward-compat aliases (some files still use these names)
  initDatabase: initializeDatabase,
  getDb:        getDatabase,
};