const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

// 1. شوف تعريف الجدول
const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name='bank_transactions'").get();
console.log('TABLE DEF:', tableInfo ? tableInfo.sql : 'NOT FOUND');

// 2. جرب ادخال يدوي
try {
  const r = db.prepare("INSERT INTO bank_transactions (raw_date, raw_description, raw_amount, parsed_date, parsed_name, normalized_name, amount, direction, transfer_type, reference_number, import_batch_id, file_name, row_number, match_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('18/02/2026', 'test', '36', '2026-02-18', 'Sanaa', 'sanaa', 36, 'incoming', 'e_wallet', null, 'test123', 'test.csv', 1, 'pending');
  console.log('INSERT OK:', r.changes);
} catch(e) {
  console.log('INSERT ERROR:', e.message);
}

// 3. عدد الصفوف
console.log('COUNT:', db.prepare('SELECT COUNT(*) as c FROM bank_transactions').get().c);

db.close();
process.exit();
