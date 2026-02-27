const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'abu-kamil-pos', 'abu-kamil-pos.db');
const db = new Database(dbPath);

// 1. فحص جدول customer_aliases
console.log('=== customer_aliases table ===');
const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE name='customer_aliases'").get();
console.log(tbl ? tbl.sql : 'TABLE NOT FOUND!');

console.log('\n=== all aliases ===');
try {
  db.prepare("SELECT * FROM customer_aliases").all().forEach(a => console.log(JSON.stringify(a)));
} catch(e) {
  console.log('ERROR:', e.message);
}

// 2. اذا فاضي نضيف
const count = db.prepare("SELECT COUNT(*) as c FROM customer_aliases").get().c;
console.log('\ncount:', count);

if (count === 0) {
  console.log('الجدول فاضي! الاسماء ما انحفظت');
}

db.close();
process.exit();
