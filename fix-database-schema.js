/**
 * fix-database-schema.js
 * Fix database.js table definitions to match what matching-engine expects
 */
const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'src', 'database', 'database.js');
let content = fs.readFileSync(dbFile, 'utf8');
const originalContent = content;
let fixes = 0;

// ═══════════════════════════════════════════════════
// FIX 1: customer_aliases - add missing columns
// ═══════════════════════════════════════════════════
const oldAliases = `CREATE TABLE IF NOT EXISTS customer_aliases (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      alias_name  TEXT NOT NULL,
      source      TEXT DEFAULT 'manual',
      created_at  TEXT DEFAULT (datetime('now'))
    )`;

const newAliases = `CREATE TABLE IF NOT EXISTS customer_aliases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER REFERENCES customers(id),
      alias_name      TEXT NOT NULL,
      normalized_name TEXT,
      source          TEXT DEFAULT 'manual',
      confidence      TEXT DEFAULT 'confirmed',
      usage_count     INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now'))
    )`;

if (content.includes(oldAliases)) {
    content = content.replace(oldAliases, newAliases);
    console.log('FIX 1: customer_aliases - added normalized_name, confidence, usage_count');
    fixes++;
} else {
    console.log('FIX 1: customer_aliases - pattern not found (may already be fixed)');
}

// ═══════════════════════════════════════════════════
// FIX 2: matching_feedback - replace with full schema
// ═══════════════════════════════════════════════════
const oldFeedback = `CREATE TABLE IF NOT EXISTS matching_feedback (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      matching_attempt_id INTEGER,
      payment_id          INTEGER,
      bank_transaction_id INTEGER,
      feedback_type       TEXT,
      user_id             INTEGER,
      notes               TEXT,
      created_at          TEXT DEFAULT (datetime('now'))
    )`;

const newFeedback = `CREATE TABLE IF NOT EXISTS matching_feedback (
      id                                INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_transaction_id               INTEGER NOT NULL,
      payment_id                        INTEGER NOT NULL,
      bank_payer_name                   TEXT NOT NULL DEFAULT '',
      payment_customer_name             TEXT NOT NULL DEFAULT '',
      bank_payer_name_normalized        TEXT NOT NULL DEFAULT '',
      payment_customer_name_normalized  TEXT NOT NULL DEFAULT '',
      bank_amount                       REAL,
      payment_amount                    REAL,
      decision_type                     TEXT NOT NULL DEFAULT 'auto_confirmed',
      confidence_score                  REAL,
      score_breakdown                   TEXT,
      decided_by                        TEXT DEFAULT 'system',
      decided_at                        TEXT DEFAULT (datetime('now','localtime')),
      notes                             TEXT
    )`;

if (content.includes(oldFeedback)) {
    content = content.replace(oldFeedback, newFeedback);
    console.log('FIX 2: matching_feedback - replaced with full schema');
    fixes++;
} else {
    console.log('FIX 2: matching_feedback - pattern not found');
}

// ═══════════════════════════════════════════════════
// FIX 3: matching_audit_trail - replace with full schema
// ═══════════════════════════════════════════════════
const oldAudit = `CREATE TABLE IF NOT EXISTS matching_audit_trail (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      action              TEXT,
      payment_id          INTEGER,
      bank_transaction_id INTEGER,
      old_status          TEXT,
      new_status          TEXT,
      user_id             INTEGER,
      details             TEXT,
      created_at          TEXT DEFAULT (datetime('now'))
    )`;

const newAudit = `CREATE TABLE IF NOT EXISTS matching_audit_trail (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_transaction_id INTEGER NOT NULL,
      payment_id          INTEGER,
      decision_type       TEXT NOT NULL DEFAULT '',
      confidence_score    REAL,
      match_type          TEXT,
      audit_data          TEXT NOT NULL DEFAULT '{}',
      can_reverse         INTEGER DEFAULT 1,
      created_at          TEXT DEFAULT (datetime('now','localtime')),
      reversed_at         TEXT,
      reversed_by         TEXT,
      reverse_reason      TEXT
    )`;

if (content.includes(oldAudit)) {
    content = content.replace(oldAudit, newAudit);
    console.log('FIX 3: matching_audit_trail - replaced with full schema');
    fixes++;
} else {
    console.log('FIX 3: matching_audit_trail - pattern not found');
}

// ═══════════════════════════════════════════════════
// FIX 4: customer_credits - add missing column
// ═══════════════════════════════════════════════════
const oldCredits = `CREATE TABLE IF NOT EXISTS customer_credits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      amount      REAL DEFAULT 0,
      type        TEXT,
      reference   TEXT,
      notes       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    )`;

const newCredits = `CREATE TABLE IF NOT EXISTS customer_credits (
      id                            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id                   INTEGER REFERENCES customers(id),
      amount                        REAL DEFAULT 0,
      type                          TEXT,
      reference                     TEXT,
      related_bank_transaction_id   INTEGER,
      notes                         TEXT,
      created_at                    TEXT DEFAULT (datetime('now'))
    )`;

if (content.includes(oldCredits)) {
    content = content.replace(oldCredits, newCredits);
    console.log('FIX 4: customer_credits - added related_bank_transaction_id');
    fixes++;
} else {
    console.log('FIX 4: customer_credits - pattern not found');
}

// ═══════════════════════════════════════════════════
// FIX 5: debts - add missing columns
// ═══════════════════════════════════════════════════
const oldDebts = `CREATE TABLE IF NOT EXISTS debts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      invoice_id  INTEGER REFERENCES invoices(id),
      amount      REAL DEFAULT 0,
      paid        REAL DEFAULT 0,
      status      TEXT DEFAULT 'pending',
      due_date    TEXT,
      notes       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    )`;

const newDebts = `CREATE TABLE IF NOT EXISTS debts (
      id                            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id                   INTEGER REFERENCES customers(id),
      invoice_id                    INTEGER REFERENCES invoices(id),
      amount                        REAL DEFAULT 0,
      paid                          REAL DEFAULT 0,
      status                        TEXT DEFAULT 'pending',
      due_date                      TEXT,
      is_shortage                   INTEGER DEFAULT 0,
      related_payment_id            INTEGER,
      related_bank_transaction_id   INTEGER,
      notes                         TEXT,
      created_at                    TEXT DEFAULT (datetime('now'))
    )`;

if (content.includes(oldDebts)) {
    content = content.replace(oldDebts, newDebts);
    console.log('FIX 5: debts - added is_shortage, related_payment_id, related_bank_transaction_id');
    fixes++;
} else {
    console.log('FIX 5: debts - pattern not found');
}

// ═══════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════
if (fixes > 0) {
    // Backup
    const backupPath = dbFile + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(backupPath, originalContent);
    console.log('\nBackup saved:', backupPath);

    fs.writeFileSync(dbFile, content);
    console.log(`\n=== ${fixes} FIXES APPLIED to database.js ===`);
} else {
    console.log('\nNo fixes needed - database.js already up to date');
}

// ═══════════════════════════════════════════════════
// FIX 6: Add column migrations in runColumnMigrations
// ═══════════════════════════════════════════════════
content = fs.readFileSync(dbFile, 'utf8');
const migrationAdditions = `
  // ── customer_aliases ──────────────────────────────────────────────────────
  addCol(db, 'customer_aliases', 'normalized_name', 'TEXT');
  addCol(db, 'customer_aliases', 'confidence', "TEXT DEFAULT 'confirmed'");
  addCol(db, 'customer_aliases', 'usage_count', 'INTEGER DEFAULT 1');

  // ── customer_credits ──────────────────────────────────────────────────────
  addCol(db, 'customer_credits', 'related_bank_transaction_id', 'INTEGER');

  // ── debts ─────────────────────────────────────────────────────────────────
  addCol(db, 'debts', 'is_shortage', 'INTEGER DEFAULT 0');
  addCol(db, 'debts', 'related_payment_id', 'INTEGER');
  addCol(db, 'debts', 'related_bank_transaction_id', 'INTEGER');

  // ── matching_feedback (upgrade old schema) ────────────────────────────────
  addCol(db, 'matching_feedback', 'bank_payer_name', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'matching_feedback', 'payment_customer_name', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'matching_feedback', 'bank_payer_name_normalized', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'matching_feedback', 'payment_customer_name_normalized', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'matching_feedback', 'bank_amount', 'REAL');
  addCol(db, 'matching_feedback', 'payment_amount', 'REAL');
  addCol(db, 'matching_feedback', 'decision_type', "TEXT NOT NULL DEFAULT 'auto_confirmed'");
  addCol(db, 'matching_feedback', 'confidence_score', 'REAL');
  addCol(db, 'matching_feedback', 'score_breakdown', 'TEXT');
  addCol(db, 'matching_feedback', 'decided_by', "TEXT DEFAULT 'system'");
  addCol(db, 'matching_feedback', 'decided_at', 'TEXT');

  // ── matching_audit_trail (upgrade old schema) ─────────────────────────────
  addCol(db, 'matching_audit_trail', 'decision_type', "TEXT NOT NULL DEFAULT ''");
  addCol(db, 'matching_audit_trail', 'confidence_score', 'REAL');
  addCol(db, 'matching_audit_trail', 'match_type', 'TEXT');
  addCol(db, 'matching_audit_trail', 'audit_data', "TEXT NOT NULL DEFAULT '{}'");
  addCol(db, 'matching_audit_trail', 'can_reverse', 'INTEGER DEFAULT 1');
  addCol(db, 'matching_audit_trail', 'reversed_at', 'TEXT');
  addCol(db, 'matching_audit_trail', 'reversed_by', 'TEXT');
  addCol(db, 'matching_audit_trail', 'reverse_reason', 'TEXT');`;

// Find the end of runColumnMigrations to insert before closing brace
const marker = "addCol(db, 'payments', 'paid_amount'";
if (content.includes(marker)) {
    // Find the line and add after the next few lines
    const markerIdx = content.indexOf(marker);
    const afterMarker = content.indexOf('\n', markerIdx);
    const insertPoint = content.indexOf('\n', afterMarker + 1);
    
    if (!content.includes("addCol(db, 'customer_aliases', 'normalized_name'")) {
        content = content.slice(0, insertPoint) + '\n' + migrationAdditions + content.slice(insertPoint);
        fs.writeFileSync(dbFile, content);
        console.log('FIX 6: Added column migrations for existing databases');
        fixes++;
    } else {
        console.log('FIX 6: Column migrations already present');
    }
} else {
    console.log('FIX 6: Could not find insertion point for column migrations');
}

console.log(`\n=== TOTAL: ${fixes} FIXES APPLIED ===`);
console.log('Now run: npm start (to test)');
console.log('Then: npx electron-builder --win --x64 (to build EXE)');
