const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function initializeDatabase() {
    const dbPath = path.join(app.getPath('userData'), 'abu-kamil-pos.db');
    console.log('PATH:', dbPath);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    createTables();
    seedData();

    const check = db.prepare('SELECT COUNT(*) as c FROM users').get();
    console.log('FINAL CHECK - users count:', check.c);

    return db;
}

function createTables() {
    db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT DEFAULT 'cashier', pin_code TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS store_settings (id INTEGER PRIMARY KEY DEFAULT 1, store_name TEXT DEFAULT 'أبو كميل', phone TEXT, address TEXT, tax_number TEXT, currency TEXT DEFAULT '', receipt_header TEXT, receipt_footer TEXT, owner_pin TEXT DEFAULT '1234', created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category_id INTEGER, sale_type TEXT DEFAULT 'unit', unit TEXT DEFAULT 'حبة', price REAL NOT NULL DEFAULT 0, cost_price REAL DEFAULT 0, stock_qty INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (category_id) REFERENCES categories(id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, address TEXT, customer_type TEXT DEFAULT 'regular', debt_ceiling REAL DEFAULT 500, notes TEXT, is_blacklisted INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, customer_name TEXT DEFAULT 'زبون عابر', customer_phone TEXT, subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0, status TEXT DEFAULT 'completed', notes TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (customer_id) REFERENCES customers(id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, barcode TEXT, quantity REAL DEFAULT 1, price REAL NOT NULL, total REAL NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (invoice_id) REFERENCES invoices(id), FOREIGN KEY (product_id) REFERENCES products(id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, status TEXT DEFAULT 'pending', transfer_type TEXT, debt_reason TEXT, alt_account_name TEXT, alt_account_relation TEXT, transfer_deadline TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), FOREIGN KEY (invoice_id) REFERENCES invoices(id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, login_time TEXT DEFAULT (datetime('now','localtime')), logout_time TEXT, is_active INTEGER DEFAULT 1, FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, user_id INTEGER, details TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS daily_closings (id INTEGER PRIMARY KEY AUTOINCREMENT, closing_date TEXT UNIQUE NOT NULL, total_sales REAL DEFAULT 0, total_cash REAL DEFAULT 0, total_transfer REAL DEFAULT 0, total_debt REAL DEFAULT 0, invoice_count INTEGER DEFAULT 0, notes TEXT, closed_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT, entity_type TEXT, entity_id INTEGER, customer_id INTEGER, customer_name TEXT, amount REAL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')))`);
    console.log('TABLES CREATED');
    // === migration columns ===
    // === Clean duplicate bank_transactions (keep newest per description+amount+date) ===
    try {
      const dupCount = db.prepare(`
        DELETE FROM bank_transactions WHERE id NOT IN (
          SELECT MAX(id) FROM bank_transactions 
          GROUP BY raw_description, amount, parsed_date
        ) AND match_status IN ('pending', 'unmatched')
      `).run();
      if (dupCount.changes > 0) console.log('[DB] Cleaned', dupCount.changes, 'duplicate bank transactions');
    } catch(e) { console.log('clean skip:', e.message); }
    console.log('DUPLICATES CLEANED');

    // === ONE-TIME DB CLEANUP v3 ===
    try {
      db.pragma('foreign_keys = OFF');
      
      // 1. Reset wrongly matched records
      const resetResult = db.prepare("UPDATE bank_transactions SET match_status = 'pending' WHERE match_status IN ('matched', 'auto_matched', 'confirmed')").run();
      if (resetResult.changes > 0) console.log('[DB] Reset', resetResult.changes, 'wrongly matched records to pending');
      
      // 2. Clear orphan payment_installments links
      db.prepare("DELETE FROM payment_installments WHERE bank_transaction_id IN (SELECT id FROM bank_transactions WHERE id NOT IN (SELECT MAX(id) FROM bank_transactions GROUP BY COALESCE(NULLIF(raw_description,''), payer_name), ROUND(amount, 2), parsed_date))").run();
      
      // 3. Delete duplicate records (keep newest per group)
      const dupResult = db.prepare(`
        DELETE FROM bank_transactions 
        WHERE id NOT IN (
          SELECT MAX(id) FROM bank_transactions 
          GROUP BY COALESCE(NULLIF(raw_description,''), payer_name), ROUND(amount, 2), parsed_date
        ) AND match_status = 'pending'
      `).run();
      if (dupResult.changes > 0) console.log('[DB] Deleted', dupResult.changes, 'duplicate records');
      
      // 4. Final count
      const count = db.prepare('SELECT COUNT(*) as c FROM bank_transactions').get();
      console.log('[DB] Final bank_transactions count:', count.c);
      
      db.pragma('foreign_keys = ON');
    } catch(e) { 
      console.log('[DB] cleanup v3 error:', e.message); 
      try { db.pragma('foreign_keys = ON'); } catch(x) {}
    }
    db.exec("DROP INDEX IF EXISTS idx_bank_tx_unique");
}

function seedData() {
    const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    console.log('ADMIN EXISTS:', adminExists);

    if (!adminExists) {
        db.prepare("INSERT INTO users (username, password_hash, display_name, role, pin_code, is_active) VALUES ('admin', 'admin123', 'المدير', 'admin', '1234', 1)").run();
        db.prepare("INSERT INTO users (username, password_hash, display_name, role, pin_code, is_active) VALUES ('cashier1', 'cash123', 'كاشير 1', 'cashier', '5678', 1)").run();
        console.log('USERS ADDED');
    }

    const settingsExist = db.prepare('SELECT id FROM store_settings WHERE id = 1').get();
    if (!settingsExist) {
        db.prepare("INSERT INTO store_settings (id, store_name, phone, address, currency, owner_pin) VALUES (1, 'محل أبو كميل', '0599000000', 'غزة - فلسطين', '', '1234')").run();
        console.log('SETTINGS ADDED');
    }

    const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
    if (catCount.c === 0) {
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('مشروبات', '', 1)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('حلويات وسناكات', '', 2)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('ألبان وأجبان', '', 3)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('مخبوزات', '', 4)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('معلبات', '', 5)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('تنظيف', '', 6)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('أدوات منزلية', '', 7)").run();
        db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('متنوع', '', 8)").run();
        console.log('CATEGORIES ADDED');
    }

    const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
    if (prodCount.c === 0) {
        const ins = db.prepare("INSERT INTO products (barcode, name, category_id, sale_type, unit, price, cost_price, stock_qty, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        ins.run('6001', 'بيبسي 500مل', 1, 'unit', 'حبة', 3.00, 2.20, 100, 10);
        ins.run('6002', 'كوكاكولا 500مل', 1, 'unit', 'حبة', 3.00, 2.20, 100, 10);
        ins.run('6003', 'ماء معدني 500مل', 1, 'unit', 'حبة', 1.50, 0.80, 200, 20);
        ins.run('6004', 'عصير تروبيكانا 1لتر', 1, 'unit', 'حبة', 8.00, 6.00, 50, 5);
        ins.run('6005', 'شوكولاتة كادبوري', 2, 'unit', 'حبة', 5.00, 3.50, 80, 10);
        ins.run('6006', 'شيبس ليز كبير', 2, 'unit', 'حبة', 6.00, 4.50, 60, 8);
        ins.run('6007', 'بسكويت أوريو', 2, 'unit', 'حبة', 4.00, 2.80, 70, 10);
        ins.run('6008', 'حليب المراعي 1لتر', 3, 'unit', 'حبة', 6.50, 5.00, 40, 5);
        ins.run('6009', 'لبنة بيتي 250غ', 3, 'unit', 'حبة', 4.50, 3.20, 30, 5);
        ins.run('6010', 'جبنة نابلسية 250غ', 3, 'weight', 'كيلو', 35.00, 28.00, 20, 3);
        ins.run('6011', 'خبز صمون', 4, 'unit', 'ربطة', 3.50, 2.50, 50, 10);
        ins.run('6012', 'خبز طابون', 4, 'unit', 'ربطة', 4.00, 3.00, 30, 5);
        ins.run('6013', 'تونة جيشا', 5, 'unit', 'حبة', 7.00, 5.50, 45, 5);
        ins.run('6014', 'فول مدمس', 5, 'unit', 'حبة', 3.50, 2.50, 60, 10);
        ins.run('6015', 'حمص جاهز', 5, 'unit', 'حبة', 4.00, 2.80, 40, 5);
        ins.run('6016', 'صابون غسيل تايد 3كغ', 6, 'unit', 'حبة', 25.00, 20.00, 20, 3);
        ins.run('6017', 'معقم ديتول 500مل', 6, 'unit', 'حبة', 15.00, 11.00, 25, 3);
        ins.run('6018', 'مناديل فاين 200ورقة', 7, 'unit', 'حبة', 8.00, 5.50, 35, 5);
        ins.run('6019', 'أكياس قمامة 50حبة', 7, 'unit', 'حبة', 6.00, 3.80, 30, 5);
        ins.run('6020', 'ولاعة', 8, 'unit', 'حبة', 2.00, 0.80, 100, 15);
        console.log('PRODUCTS ADDED');
    }

    const custCount = db.prepare('SELECT COUNT(*) as c FROM customers').get();
    if (custCount.c === 0) {
        const ins = db.prepare("INSERT INTO customers (name, phone, address, customer_type, debt_ceiling, notes) VALUES (?, ?, ?, ?, ?, ?)");
        ins.run('أحمد أبو ثريا', '0599111111', 'غزة - تل الهوا', 'regular', 500, 'زبون منتظم');
        ins.run('محمد العمري', '0598222222', 'غزة - الرمال', 'regular', 300, null);
        ins.run('رامي عبد الله', '0597333333', 'غزة - الشجاعية', 'wholesale', 2000, 'تاجر جملة');
        ins.run('سارة حسين', '0596444444', 'غزة - النصر', 'vip', 1000, 'زبونة مميزة');
        ins.run('عبدالرحمن أبو ثريا', '0595555555', 'غزة - تل الهوا', 'regular', 500, 'ابن أحمد أبو ثريا');
        console.log('CUSTOMERS ADDED');
    }

    console.log('SEED DONE');
}

function getDatabase() { return db; }
function closeDatabase() { if (db) { db.close(); db = null; } }

module.exports = { initializeDatabase, getDatabase, closeDatabase };





