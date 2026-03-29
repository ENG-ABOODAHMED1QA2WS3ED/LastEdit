/* ========================================
   main.js - أبو كميل POS v6.0
   العملية الرئيسية - Electron Main Process
   محدث: نظام المطابقة الذكية
======================================== */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, getDatabase, closeDatabase } = require('../database/database');
const { MatchingEngine } = require('./matching-engine');
const { runMigrationV8 } = require('./migration-v8');
const LicenseManager = require('./license-manager');
const { createStatementHandler } = require('./customer-statement');
let licenseManager = null;
let activationWindow = null;

// === UTF-8 Console Fix (Windows) ===
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch(e) {}
}



let mainWindow;
let db;
let matchingEngine;
let currentUserId = null;

// ==================== إنشاء النافذة ====================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '../../assets/icon.ico'),
        title: 'أبو كميل POS',
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/pages/login.html'));

    mainWindow.webContents.on('did-finish-load', () => {
        try {
            var currentUrl = mainWindow.webContents.getURL();
            if (currentUrl.includes('login.html')) {
                setTimeout(function() {
                    mainWindow.webContents.focus();
                    mainWindow.webContents.executeJavaScript(
                        'var fi = document.getElementById("username");' +
                        'if(fi){fi.focus();fi.click();}'
                    ).catch(function(){});
                }, 500);
            }
        } catch(e) {}
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ==================== بدء التطبيق ====================
app.whenReady().then(() => {
    try {
        // === نسخ احتياطي تلقائي ===
        try {
            const dbDir = app.getPath('userData');
            const dbFile = path.join(dbDir, 'abu-kamil-pos.db');
            const backupDir = path.join(dbDir, 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
            if (fs.existsSync(dbFile)) {
                const now = new Date();
                const stamp = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + '-' + String(now.getMinutes()).padStart(2,'0');
                const backupFile = path.join(backupDir, 'backup_' + stamp + '.db');
                if (!fs.existsSync(backupFile)) {
                    fs.copyFileSync(dbFile, backupFile);
                    console.log('backup created:', backupFile);
                }
                const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_')).sort();
                while (files.length > 30) { fs.unlinkSync(path.join(backupDir, files.shift())); }
            }
        } catch(e) { console.error('backup error:', e); }
        db = initializeDatabase();

        // --- Central helper for bank reference checks ---
        
        /**
        * Single source of truth for bank reference checks.
        * Must match DB unique index: idx_payments_bank_ref (database.js line 52)
        * WHERE bank_reference IS NOT NULL AND status IN ('pending','awaiting_transfer','partial')
        * Use this function everywhere - never write bank_reference SQL directly.
        */
        function isBankReferenceInUse(bankRef) {
        if (!bankRef) return { inUse: false };
        const row = db.prepare(`
        SELECT id, invoice_id, status, amount
        FROM payments
        WHERE bank_reference = ?
        AND status IN ('pending', 'awaiting_transfer', 'partial')
        `).get(bankRef);
        if (row) {
        const inv = db.prepare('SELECT customer_name FROM invoices WHERE id = ?').get(row.invoice_id);
        return { inUse: true, paymentId: row.id, invoiceId: row.invoice_id, status: row.status, amount: row.amount, customerName: inv?.customer_name || null };
        }
        return { inUse: false };
        }

        // check-bank-reference handler - inside whenReady scope
        ipcMain.handle('check-bank-reference', async (event, reference) => {
            try {
                if (!reference || reference.length < 8) return { exists: false };
                const result = isBankReferenceInUse(reference);
                if (result.inUse) {
                    return { exists: true, paymentId: result.paymentId, status: result.status };
                }
                return { exists: false };
            } catch(e) { return { exists: false, error: e.message }; }
        });

        matchingEngine = new MatchingEngine(db);
        
        // Migration v8  إضافة أعمدة المطابقة الذكية
        try {
            const migResult = runMigrationV8(db);
            console.log('[Migration v8] added:', migResult.added, '| skipped:', migResult.skipped);
        } catch (migErr) {
            console.error('[Migration v8] Error:', migErr.message);
        }
        console.log(' قاعدة البيانات جاهزة');
        console.log(' محرك المطابقة الذكية جاهز');
    } catch (error) {
        console.error(' فشل تهيئة قاعدة البيانات:', error);
        app.quit();
        return;
    }

    // === فحص الترخيص قبل فتح التطبيق ===
    const userDataPath = app.getPath('userData');
    licenseManager = new LicenseManager(userDataPath);
    registerIpcHandlers();
    registerLicenseHandlers();

    const licenseCheck = licenseManager.checkLicense();
    // دائماً نعرض شاشة التفعيل عشان المستخدم يشوف حالة الاشتراك
    console.log('[License]', licenseCheck.valid ? 'ترخيص فعّال - عرض حالة الاشتراك' : 'بحاجة لتفعيل:', licenseCheck.error || '');
    openActivationWindow();





    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        closeDatabase();
        app.quit();
    }
});

// ==================== تسجيل IPC Handlers ====================

// ==================== دالة مركزية لحساب حالة الفاتورة ====================
function recalcInvoicePaymentStatus(invoiceId) {
    if (!invoiceId || !db) return;
    const invoice = db.prepare('SELECT total FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) return;

    const payments = db.prepare(
        "SELECT id, method, amount, status, COALESCE(paid_amount, 0) as paid_amount, COALESCE(remaining_amount, 0) as remaining_amount FROM payments WHERE invoice_id = ?"
    ).all(invoiceId);

    let totalPaid = 0;
    let hasPending = false;
    const pendingTransfers = [];

    for (const p of payments) {
        if (p.status === 'confirmed' || p.status === 'paid') {
            // ══ KEY FIX: Use paid_amount when available, fall back to amount ══
            // For partial transfers: paid_amount=19, amount=20 -> use 19
            // For full payments: paid_amount=0 or null, amount=50 -> use amount
            // For debts that were paid: paid_amount=1, amount=1 -> use amount (same)
            if (p.paid_amount > 0) {
                totalPaid += p.paid_amount;
            } else {
                totalPaid += p.amount;
            }
        } else if (p.status === 'partial' && p.paid_amount > 0) {
            totalPaid += p.paid_amount;
        } else if (p.status === 'pending' || p.status === 'awaiting_transfer' || p.status === 'pending_match') {
            hasPending = true;
            if (p.method === 'transfer') {
                pendingTransfers.push(p);
            }
        }
    }

    // ══════════════ AUTO-RESOLVE PENDING TRANSFERS ══════════════
    // When all shortage debts on an invoice are settled, confirm the pending transfer.
    // Uses paid_amount for accurate calculation (not amount which may be the original full value).
    if (pendingTransfers.length > 0) {
        let paidWithoutPendingTransfers = 0;
        for (const p of payments) {
            if (p.method === 'transfer' && (p.status === 'pending' || p.status === 'awaiting_transfer' || p.status === 'partial')) continue;
            if (p.status === 'confirmed' || p.status === 'paid') {
                if (p.paid_amount > 0) {
                    paidWithoutPendingTransfers += p.paid_amount;
                } else {
                    paidWithoutPendingTransfers += p.amount;
                }
            } else if (p.status === 'partial' && p.paid_amount > 0) {
                paidWithoutPendingTransfers += p.paid_amount;
            }
        }

        for (const pt of pendingTransfers) {
            // Use paid_amount of the transfer (what actually arrived) + settled debts
            const transferActualPaid = pt.paid_amount > 0 ? pt.paid_amount : pt.amount;
            if (paidWithoutPendingTransfers + transferActualPaid >= invoice.total) {
                try {
                    db.prepare(
                        "UPDATE payments SET status = 'confirmed', remaining_amount = 0, updated_at = datetime('now','localtime') WHERE id = ?"
                    ).run(pt.id);
                    totalPaid += transferActualPaid;
                    hasPending = pendingTransfers.length <= 1 ? false : hasPending;
                    console.log('[recalc] Auto-confirmed transfer #' + pt.id + ' (paid=' + transferActualPaid + ') on invoice #' + invoiceId);
                } catch(e) {
                    console.warn('[recalc] Failed to auto-confirm transfer:', e.message);
                }
            }
        }
    }

    let newStatus;
    if (totalPaid >= invoice.total) {
        newStatus = 'paid';
    } else if (totalPaid > 0 || hasPending) {
        newStatus = 'partial';
    } else {
        newStatus = 'unpaid';
    }
    
    db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(newStatus, invoiceId);
    return newStatus;
}

function registerIpcHandlers() {

    // === كشف حساب الزبون ===
    const statementHandler = createStatementHandler(db);
    ipcMain.handle('get-customer-statement', async (event, customerId, fromDate, toDate) => {
        try {
            return statementHandler.getCustomerStatement(customerId, fromDate, toDate);
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // === DEBUG: temporary diagnostic handler ===
    
  
  ipcMain.handle('cleanup-duplicate-payments', async () => {
    try {
      const dupes = db.prepare(`
        SELECT invoice_id, amount, GROUP_CONCAT(id) as payment_ids, COUNT(*) as cnt
        FROM payments
        WHERE status = 'confirmed'
        GROUP BY invoice_id, amount
        HAVING cnt > 1
      `).all();

      if (dupes.length === 0) return { success: true, message: 'No duplicates found', deleted: 0 };

      let totalDeleted = 0;
      const details = [];

      for (const dupe of dupes) {
        const ids = dupe.payment_ids.split(',').map(Number);
        const keepId = Math.min(...ids);
        const deleteIds = ids.filter(id => id !== keepId);

        for (const delId of deleteIds) {
          db.prepare('DELETE FROM payments WHERE id = ?').run(delId);
          totalDeleted++;
        }
        details.push({
          invoice_id: dupe.invoice_id,
          amount: dupe.amount,
          kept: keepId,
          deleted: deleteIds
        });
      }

      return { success: true, deleted: totalDeleted, details };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('debug-check-duplicates', async () => {
    try {
      const dupes = db.prepare(`
        SELECT invoice_id, amount, COUNT(*) as cnt, GROUP_CONCAT(id) as payment_ids
        FROM payments 
        WHERE status = 'confirmed'
        GROUP BY invoice_id, amount 
        HAVING cnt > 1
      `).all();
      const totalPayments = db.prepare('SELECT COUNT(*) as c FROM payments').get();
      const confirmed = db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'confirmed'").get();
      const matchAttempts = db.prepare('SELECT COUNT(*) as c FROM matching_attempts').get();
      const bankMatched = db.prepare("SELECT COUNT(*) as c FROM bank_transactions WHERE match_status != 'pending'").get();
      const bankPending = db.prepare("SELECT COUNT(*) as c FROM bank_transactions WHERE match_status = 'pending'").get();
      return { dupes, totalPayments, confirmed, matchAttempts, bankMatched, bankPending };
    } catch(e) { return { error: e.message }; }
  });

  ipcMain.handle('debug-matching-state', async () => {
        try {
            const bankMatched = db.prepare("SELECT id, match_status, matched_payment_id, parsed_name, amount FROM bank_transactions WHERE match_status != 'pending' ORDER BY id DESC LIMIT 10").all();
            const bankPending = db.prepare("SELECT COUNT(*) as cnt FROM bank_transactions WHERE match_status = 'pending'").get();
            const attempts = db.prepare("SELECT id, bank_transaction_id, payment_id, decision, score FROM matching_attempts ORDER BY id DESC LIMIT 20").all();
            const paymentsConfirmed = db.prepare("SELECT id, invoice_id, status, method, amount FROM payments WHERE status = 'confirmed' ORDER BY id DESC LIMIT 10").all();
            const paymentsPending = db.prepare("SELECT id, invoice_id, status, method, amount FROM payments WHERE status IN ('pending','pending_match','awaiting_transfer') ORDER BY id DESC LIMIT 10").all();
            return { bank_matched: bankMatched, bank_pending_count: bankPending.cnt, matching_attempts: attempts, payments_confirmed: paymentsConfirmed, payments_pending: paymentsPending };
        } catch(e) { return { error: e.message }; }
    });
    // === END DEBUG ===

    // ==================== معلومات التطبيق ====================
ipcMain.handle('get-app-info', async () => {
        return { version: '6.0.0', name: 'أبو كميل POS' };
    });

    // ==================== قراءة Excel ====================
    ipcMain.handle('read-excel-file', async (event, data) => {
        try {
            const XLSX = require('xlsx');
            let workbook;
            if (data.buffer) {
                const buf = Buffer.from(data.buffer);
                workbook = XLSX.read(buf, { type: 'buffer' });
            } else if (data.path) {
                workbook = XLSX.readFile(data.path);
            } else {
                return { success: false, error: 'لا يوجد ملف' };
            }
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            return { success: true, data: jsonData, sheetName };
        } catch (err) {
            console.error('read-excel error:', err);
            return { success: false, error: err.message };
        }
    });

    // ==================== إعدادات المتجر ====================
    ipcMain.handle('get-store-settings', async () => {
        try {
            const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
            return { success: true, settings: settings || {} };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('update-store-settings', async (event, data) => {
        try {
            const current = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
            if (!current) {
                db.prepare("INSERT OR IGNORE INTO store_settings (id, key, value) VALUES (1, '_config', 'default')").run();
            }
            const fields = [];
            const values = [];
            const allowed = ['store_name', 'phone', 'address', 'tax_number', 'currency', 'receipt_header', 'receipt_footer', 'owner_pin', 'default_debt_ceiling'];
            for (const key of allowed) {
                if (data[key] !== undefined) {
                    fields.push(key + ' = ?');
                    values.push(data[key]);
                }
            }
            if (fields.length === 0) return { success: false, error: 'لا توجد بيانات للتحديث' };
            fields.push("updated_at = datetime('now','localtime')");
            values.push(1);
            db.prepare('UPDATE store_settings SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== المنتجات ====================
    ipcMain.handle('get-products', async () => {
        try {
            const products = db.prepare(`
                SELECT p.*, c.name as category_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = 1
                ORDER BY p.name
            `).all();
            return { success: true, products };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('search-products', async (event, query) => {
        try {
            const products = db.prepare(`
                SELECT p.*, c.name as category_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = 1
                AND (p.name LIKE ? OR p.barcode LIKE ?)
                ORDER BY p.name LIMIT 20
            `).all(`%${query}%`, `%${query}%`);
            return { success: true, products };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-product-by-barcode', async (event, barcode) => {
        try {
            const product = db.prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1').get(barcode);
            return product ? { success: true, product } : { success: false, error: 'المنتج غير موجود' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('add-product', async (event, data) => {
        try {
            const existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(data.barcode);
            if (existing) return { success: false, error: 'الباركود موجود مسبقاً' };

            db.prepare(`
                INSERT INTO products (barcode, name, category_id, sale_type, unit, price, cost_price, stock_qty, min_stock, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
            `).run(data.barcode, data.name, data.category_id || null, data.sale_type || 'unit', data.unit || 'حبة', data.price, data.cost_price || 0, data.stock_qty || 0, data.min_stock || 5);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-product', async (event, id, data) => {
        try {
            db.prepare(`
                UPDATE products SET name=?, category_id=?, sale_type=?, unit=?, price=?, cost_price=?, stock_qty=?, min_stock=?, updated_at=datetime('now','localtime')
                WHERE id=?
            `).run(data.name, data.category_id || null, data.sale_type || 'unit', data.unit || 'حبة', data.price, data.cost_price || 0, data.stock_qty || 0, data.min_stock || 5, id);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-product', async (event, id) => {
        try {
            db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== التصنيفات ====================
    ipcMain.handle('get-categories', async () => {
        try {
            const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
            return { success: true, categories };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('add-category', async (event, data) => {
        try {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories').get();
            const result = db.prepare('INSERT INTO categories (name, icon, sort_order, is_active) VALUES (?, ?, ?, 1)')
                .run(data.name, data.icon || '', (maxOrder.m || 0) + 1);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('update-category', async (event, data) => {
        try {
            db.prepare('UPDATE categories SET name=?, icon=?, sort_order=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
                .run(data.name, data.icon || '', data.sort_order || 0, data.id);
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('delete-category', async (event, id) => {
        try {
            const hasProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1').get(id);
            if (hasProducts.count > 0) {
                return { success: false, error: 'لا يمكن حذف الفئة - مرتبطة بمنتجات' };
            }
            db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').run(id);
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== الزبائن ====================
    ipcMain.handle('get-customers', async () => {
        try {
            const customers = db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY name').all();
            return { success: true, customers };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('search-customers', async (event, query) => {
        try {
            const normalizeAr = (s) => (s||'').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
            const allCustomers = db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY name').all();
            const q = (query || '').trim();
            const qNorm = normalizeAr(q).toLowerCase();
            const customers = allCustomers.filter(c => {
                const nameNorm = normalizeAr(c.name || '').toLowerCase();
                const phone = (c.phone || '');
                return nameNorm.includes(qNorm) || (c.name||'').toLowerCase().includes(q.toLowerCase()) || phone.includes(q);
            }).slice(0, 20);
            return { success: true, customers };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('add-customer', async (event, data) => {
        try {
            const result = db.prepare(`
                INSERT INTO customers (name, phone, address, customer_type, debt_ceiling, notes, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
            `).run(data.name, data.phone || null, data.address || null, data.customer_type || 'regular', data.debt_ceiling || 500, data.notes || null);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-customer', async (event, id, data) => {
        try {
            if (data.alt_account_name !== undefined) {
                db.prepare(`
                    UPDATE customers SET name=?, phone=?, address=?, customer_type=?, debt_ceiling=?, notes=?,
                    alt_account_name=?, alt_account_relation=?, updated_at=datetime('now','localtime') WHERE id=?
                `).run(data.name || '', data.phone || null, data.address || null, data.customer_type || 'regular',
                    data.debt_ceiling || 500, data.notes || null, data.alt_account_name, data.alt_account_relation || null, id);
            } else {
                db.prepare(`
                    UPDATE customers SET name=?, phone=?, address=?, customer_type=?, debt_ceiling=?, notes=?,
                    updated_at=datetime('now','localtime') WHERE id=?
                `).run(data.name || '', data.phone || null, data.address || null, data.customer_type || 'regular',
                    data.debt_ceiling || 500, data.notes || null, id);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-customer', async (event, id) => {
        try {
            const hasInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?').get(id);
            if (hasInvoices.count > 0) {
                return { success: false, error: 'لا يمكن حذف الزبون  مرتبط بفواتير' };
            }
            db.prepare('DELETE FROM customers WHERE id = ?').run(id);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== ديون الزبائن ====================
    ipcMain.handle('get-customer-debts', async (event, customerId) => {
        try {
            const debts = db.prepare(`
                SELECT p.*, i.customer_name
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE i.customer_id = ? AND p.method = 'debt' AND p.status IN ('pending', 'unpaid')
                ORDER BY p.created_at DESC
            `).all(customerId);

            const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
            return { success: true, debts, total_debt: totalDebt };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('pay-debt', async (event, data) => {
        try {
            const { payment_id, amount, method, notes } = data;

            const payment = db.prepare('SELECT p.*, i.customer_id, i.total as invoice_total FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE p.id = ?').get(payment_id);
            if (!payment) return { success: false, error: 'الدين غير موجود' };

            const payTransaction = db.transaction(() => {
                if (amount >= payment.amount) {
                    // ══ سداد كامل: حدّث status + paid_amount + remaining_amount ══
                    db.prepare(`
                        UPDATE payments SET
                            status = 'confirmed',
                            paid_amount = ?,
                            remaining_amount = 0,
                            notes = COALESCE(notes, '') || ?
                        WHERE id = ?
                    `).run(
                        payment.amount,
                        ' | تم السداد ' + (method === 'cash' ? 'نقدا' : method) + ' - ' + (notes || ''),
                        payment_id
                    );
                } else {
                    // ══ سداد جزئي: خفض المبلغ المتبقي ══
                    db.prepare(`
                        UPDATE payments SET
                            paid_amount = COALESCE(paid_amount, 0) + ?,
                            remaining_amount = CASE WHEN remaining_amount IS NOT NULL THEN remaining_amount - ? ELSE amount - ? END,
                            notes = COALESCE(notes, '') || ?
                        WHERE id = ?
                    `).run(
                        amount,
                        amount,
                        amount,
                        ' | سداد جزئي ' + amount + ' ' + method + ' - ' + (notes || ''),
                        payment_id
                    );
                }

                db.prepare(`
                    INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at)
                    VALUES ('pay_debt', 'payment', ?, ?, ?, datetime('now','localtime'))
                `).run(payment_id, currentUserId, 'سداد ' + amount + ' من دين - ' + method + ' - ' + (notes || ''));
            });

            payTransaction();

            // ══════════════ AUTO-CONFIRM RELATED TRANSFER ══════════════
            // Strategy: Find the original transfer that this debt is a shortage of.
            // Method 1: Check notes for "shortage_of_payment:XXX" marker
            // Method 2: Find pending/partial transfer on same invoice
            // When all debts on the invoice are confirmed/paid, confirm the transfer too.
            try {
                let relatedTransferId = null;

                // Method 1: Extract from notes marker (new debts created by engine)
                const notesStr = payment.notes || '';
                const markerMatch = notesStr.match(/shortage_of_payment:(\d+)/);
                if (markerMatch) {
                    relatedTransferId = parseInt(markerMatch[1]);
                }

                // Method 2: Find partial/pending transfer on same invoice (legacy debts)
                if (!relatedTransferId) {
                    const transferOnInvoice = db.prepare(
                        "SELECT id FROM payments WHERE invoice_id = ? AND method = 'transfer' AND status IN ('partial', 'pending', 'awaiting_transfer') ORDER BY id ASC LIMIT 1"
                    ).get(payment.invoice_id);
                    if (transferOnInvoice) {
                        relatedTransferId = transferOnInvoice.id;
                    }
                }

                if (relatedTransferId) {
                    // Check if ALL debts related to this invoice are now settled
                    const pendingDebts = db.prepare(
                        "SELECT COUNT(*) as count FROM payments WHERE invoice_id = ? AND method = 'debt' AND status IN ('pending', 'unpaid')"
                    ).get(payment.invoice_id);

                    if (pendingDebts.count === 0) {
                        // All debts paid -> confirm the original transfer
                        const transfer = db.prepare('SELECT * FROM payments WHERE id = ?').get(relatedTransferId);
                        if (transfer && transfer.status !== 'confirmed') {
                            db.prepare(`
                                UPDATE payments SET
                                    status = 'confirmed',
                                    remaining_amount = 0,
                                    updated_at = datetime('now','localtime')
                                WHERE id = ?
                            `).run(relatedTransferId);
                            console.log('[PayDebt] Auto-confirmed transfer #' + relatedTransferId + ' - all shortage debts settled');
                        }
                    } else {
                        console.log('[PayDebt] Transfer #' + relatedTransferId + ' still has ' + pendingDebts.count + ' pending debts');
                    }
                }
            } catch(autoConfirmErr) {
                console.warn('[PayDebt] Auto-confirm check failed:', autoConfirmErr.message);
            }

            recalcInvoicePaymentStatus(payment.invoice_id);
            return { success: true, message: 'تم سداد ' + amount };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== تسجيل الدخول ====================
    ipcMain.handle('login', async (event, credentials) => {
        try {
            const { username, password } = credentials;
            const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);

            if (!user) return { success: false, error: 'اسم المستخدم غير موجود' };
            if (user.password_hash !== password) return { success: false, error: 'كلمة المرور غير صحيحة' };

            const session = db.prepare(`
                INSERT INTO sessions (user_id, login_time, is_active) VALUES (?, datetime('now','localtime'), 1)
            `).run(user.id);

            db.prepare(`
                INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at)
                VALUES ('login', 'user', ?, ?, 'تسجيل دخول', datetime('now','localtime'))
            `).run(user.id, user.id);

            currentUserId = user.id;
            return {
                success: true,
                user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
                session_id: session.lastInsertRowid
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('app-relaunch', async () => {
        app.relaunch();
        app.exit(0);
    });

    ipcMain.handle('logout', async (event, sessionId) => {
        try {
            db.prepare(`UPDATE sessions SET logout_time = datetime('now','localtime'), is_active = 0 WHERE id = ?`).run(sessionId);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('verify-owner-pin', async (event, pin) => {
        try {
            const settings = db.prepare('SELECT owner_pin FROM store_settings WHERE id = 1').get();
            return { success: true, valid: settings && settings.owner_pin === pin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== إحصائيات اليوم ====================
    ipcMain.handle('get-today-stats', async () => {
        try {
            const sales = db.prepare(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM invoices WHERE date(created_at) = date('now','localtime')
            `).get();
            const cards = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE date(i.created_at) = date('now','localtime') AND p.method = 'card'
            `).get();


            const cash = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE date(i.created_at) = date('now','localtime') AND p.method = 'cash'
            `).get();

            const transfers = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE date(i.created_at) = date('now','localtime') AND p.method IN ('transfer', 'wallet')
            `).get();

            const debts = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE date(i.created_at) = date('now','localtime') AND p.method = 'debt'
            `).get();

            const pendingTransfers = db.prepare(`
                SELECT COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
                FROM payments p
                WHERE p.method IN ('transfer', 'wallet') AND p.status IN ('pending', 'pending_match', 'awaiting_transfer')
            `).get();

            return {
                success: true,
                stats: {
                    sales_count: sales.count, sales_total: sales.total,
                    cash_total: cash.total, card_total: cards.total, transfers_total: transfers.total,
                    debts_total: debts.total,
                    pending_transfers_count: pendingTransfers.count, pending_transfers_total: pendingTransfers.total
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== حفظ الفاتورة ====================
    ipcMain.handle('save-invoice', async (event, invoiceData) => {
        try {
            const { customer_id, customer_name, customer_phone, items, payments, discount, notes } = invoiceData;
            const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const total = subtotal - (discount || 0);

            const saveTransaction = db.transaction(() => {
                const invoiceResult = db.prepare(`
                    INSERT INTO invoices (customer_id, customer_name, customer_phone, subtotal, discount, total, status, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, datetime('now','localtime'), datetime('now','localtime'))
                `).run(customer_id || null, customer_name || 'زبون عابر', customer_phone || null, subtotal, discount || 0, total, notes || null);

                const invoiceId = invoiceResult.lastInsertRowid;

                const insertItem = db.prepare(`
                    INSERT INTO invoice_items (invoice_id, product_id, product_name, barcode, quantity, price, total, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
                `);
                const updateStock = db.prepare(`UPDATE products SET stock_qty = MAX(stock_qty - ?, 0), updated_at = datetime('now','localtime') WHERE id = ?`);

                for (const item of items) {
                    insertItem.run(invoiceId, item.product_id, item.name, item.barcode || null, item.quantity, item.price, item.price * item.quantity);
                    updateStock.run(item.quantity, item.product_id);
                }

                const insertPayment = db.prepare(`
                    INSERT INTO payments (invoice_id, customer_id, method, amount, status, transfer_type, debt_reason, alt_account_name, alt_account_relation, transfer_deadline, notes, bank_reference, created_at)
                    VALUES (@invoice_id, @customer_id, @method, @amount, @status, @transfer_type, @debt_reason, @alt_account_name, @alt_account_relation, @transfer_deadline, @notes, @bank_reference, datetime('now','localtime'))
                `);


                // Pure function: builds payment data object from form input
                function buildPaymentData(pay, invoiceId, customerId) {
                    if (pay.method === "cash") {
                        return { invoice_id: invoiceId, customer_id: customerId || null, method: "cash", amount: pay.amount, status: "confirmed", transfer_type: null, debt_reason: null, alt_account_name: null, alt_account_relation: null, transfer_deadline: null, notes: "دفع نقدي", bank_reference: null };
                    }
                    if (pay.method === "card") {
                        return { invoice_id: invoiceId, customer_id: customerId || null, method: "card", amount: pay.amount, status: "confirmed", transfer_type: null, debt_reason: null, alt_account_name: null, alt_account_relation: null, transfer_deadline: null, notes: "دفع بالبطاقة", bank_reference: null };
                    }
                    if (pay.method === "debt") {
                        return { invoice_id: invoiceId, customer_id: customerId || null, method: "debt", amount: pay.amount, status: "pending", transfer_type: null, debt_reason: pay.debt_reason || "دين مباشر", alt_account_name: null, alt_account_relation: null, transfer_deadline: null, notes: pay.notes || "دين على الزبون", bank_reference: null };
                    }
                    // transfer or wallet
                    const transferType = pay.transfer_type || pay.timing || "now";
                    const altName = pay.alt_account_name || null;
                    const altRelation = pay.alt_account_relation || null;
                    const bankType = pay.method === "transfer" ? (pay.bank || "bank_palestine") : "palpay";
                    if (transferType === "now") {
                        return { invoice_id: invoiceId, customer_id: customerId || null, method: pay.method, amount: pay.amount, status: "pending", transfer_type: bankType, debt_reason: null, alt_account_name: altName, alt_account_relation: altRelation, transfer_deadline: null, notes: "تحويل فوري - بانتظار المطابقة" + (altName ? " | من حساب: " + altName : ""), bank_reference: pay.bank_reference || null };
                    }
                    const deadlineHours = pay.transfer_deadline_hours || 0;
                    const deadlineAt = deadlineHours > 0 ? new Date(Date.now() + deadlineHours * 3600000).toISOString().replace("T"," ").substring(0,19) : null;
                    return { invoice_id: invoiceId, customer_id: customerId || null, method: pay.method, amount: pay.amount, status: "awaiting_transfer", transfer_type: bankType, debt_reason: "تحويل لاحق", alt_account_name: altName, alt_account_relation: altRelation, transfer_deadline: deadlineAt, notes: "سيحول لاحقا" + (deadlineHours > 0 ? " | مهلة: " + deadlineHours + " ساعة" : "") + (altName ? " | من حساب: " + altName : ""), bank_reference: pay.bank_reference || null, _needsNotification: true, _deadlineHours: deadlineHours };
                }

                for (const pay of payments) {
                    // Duplicate reference check for transfers
                    if ((pay.method === 'transfer' || pay.method === 'wallet') && pay.bank_reference) {
                        const existingRef = db.prepare("SELECT p.id, p.invoice_id, i.customer_name FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.bank_reference = ? AND p.status IN ('pending','awaiting_transfer','partial')").get(pay.bank_reference);
                        if (existingRef) {
                            throw new Error("الرقم المرجعي " + pay.bank_reference + " مستخدم بفاتورة " + (existingRef.customer_name || existingRef.invoice_id));
                        }
                    }

                    const payData = buildPaymentData(pay, invoiceId, customer_id);
                    insertPayment.run(payData);

                    // Auto-save alt_account_name to customer_aliases for future matching
                    if (payData.alt_account_name && customer_id) {
                        try {
                            const existingAlias = db.prepare(
                                'SELECT id FROM customer_aliases WHERE customer_id = ? AND alias_name = ?'
                            ).get(customer_id, payData.alt_account_name);
                            if (!existingAlias) {
                                db.prepare(
                                    "INSERT INTO customer_aliases (customer_id, alias_name, normalized_name, source, confidence, usage_count, created_at) VALUES (?, ?, ?, 'invoice_alt', 'confirmed', 1, datetime('now','localtime'))"
                                ).run(customer_id, payData.alt_account_name, payData.alt_account_name.toLowerCase().trim());
                                console.log('[SaveInvoice] Saved alt alias:', payData.alt_account_name, '-> customer', customer_id);
                            } else {
                                db.prepare('UPDATE customer_aliases SET usage_count = usage_count + 1 WHERE id = ?').run(existingAlias.id);
                            }
                        } catch (aliasErr) {
                            console.warn('[SaveInvoice] Alias save failed:', aliasErr.message);
                        }
                    }

                    // Send notification for deferred transfers
                    if (payData._needsNotification) {
                        try {
                            db.prepare(`INSERT INTO notifications (type, title, message, entity_type, entity_id, customer_id, customer_name, amount, is_read, created_at) VALUES ('pending_transfer', 'تحويل لاحق - بانتظار التحويل', ?, 'invoice', ?, ?, ?, ?, 0, datetime('now','localtime'))`).run(
                                (customer_name || 'زبون عابر') + ' وعد بتحويل ' + pay.amount + (payData.alt_account_name ? ' من حساب ' + payData.alt_account_name : ''), invoiceId, customer_id || null, customer_name || 'زبون عابر', pay.amount);
                        } catch (notifErr) { console.log('notification error:', notifErr.message); }
                    }
                }

                db.prepare(`
                    INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at)
                    VALUES ('create_invoice', 'invoice', ?, ?, ?, datetime('now','localtime'))
                `).run(invoiceId, currentUserId, 'فاتورة جديدة #' + invoiceId + ' - ' + (customer_name || 'زبون عابر') + ' - ' + total + '');

                return invoiceId;
            });

            const invoiceId = saveTransaction();
            return { success: true, invoice_id: invoiceId };
        } catch (error) {
            console.error(' خطأ في حفظ الفاتورة:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== الفواتير ====================
    // ==================== �������� ��� ����� ��� ���� ====================
    ipcMain.handle('get-payment-stats', async (event, dateFrom, dateTo) => {
        try {
            const cash = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE i.created_at >= ? AND i.created_at <= ? AND p.method = 'cash'
            `).get(dateFrom, dateTo);

            const card = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE i.created_at >= ? AND i.created_at <= ? AND p.method = 'card'
            `).get(dateFrom, dateTo);

            const transfer = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE i.created_at >= ? AND i.created_at <= ? AND p.method IN ('transfer', 'wallet')
            `).get(dateFrom, dateTo);

            const debt = db.prepare(`
                SELECT COALESCE(SUM(p.amount), 0) as total
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE i.created_at >= ? AND i.created_at <= ? AND p.method = 'debt'
            `).get(dateFrom, dateTo);

            return {
                success: true,
                stats: {
                    cash_total: cash.total,
                    card_total: card.total,
                    transfers_total: transfer.total,
                    debts_total: debt.total
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-recent-invoices', async (event, limit) => {
        try {
            const invoices = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?').all(limit || 20);
            // إضافة payment_type لكل فاتورة
            for (const inv of invoices) {
                const payMethods = db.prepare('SELECT DISTINCT method FROM payments WHERE invoice_id = ?').all(inv.id);
                if (payMethods.length === 0) inv.payment_type = null;
                else if (payMethods.length === 1) inv.payment_type = payMethods[0].method;
                else inv.payment_type = 'mixed';
            }
            return { success: true, invoices };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-invoice-details', async (event, invoiceId) => {
        try {
            const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
            if (!invoice) return { success: false, error: 'الفاتورة غير موجودة' };
            const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
            const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(invoiceId);
            return { success: true, invoice, items, payments };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('search-invoices', async (event, filters) => {
        try {
            let query = 'SELECT * FROM invoices WHERE 1=1';
            const params = [];
            if (filters.customer_id) { query += ' AND customer_id = ?'; params.push(filters.customer_id); }
            if (filters.customer_name) { query += ' AND customer_name LIKE ?'; params.push('%' + filters.customer_name + '%'); }
            if (filters.date_from) { query += ' AND date(created_at) >= ?'; params.push(filters.date_from); }
            if (filters.date_to) { query += ' AND date(created_at) <= ?'; params.push(filters.date_to); }
            query += ' ORDER BY created_at DESC LIMIT 100';
            const invoices = db.prepare(query).all(...params);
            return { success: true, invoices };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== التحويلات ====================
    ipcMain.handle('get-pending-transfers', async () => {
        try {
            const transfers = db.prepare(`
                SELECT p.id, p.invoice_id, p.method, p.amount, p.status,
                    p.transfer_type, p.alt_account_name, p.alt_account_relation,
                    p.notes, p.created_at,
                    i.customer_id, i.customer_name, i.customer_phone, i.total as invoice_total,
                    c.alt_account_name as customer_alt_name
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                LEFT JOIN customers c ON i.customer_id = c.id
                WHERE p.method IN ('transfer', 'wallet')
                AND p.status IN ('pending', 'pending_match', 'awaiting_transfer')
                ORDER BY p.created_at DESC
            `).all();
            return { success: true, transfers };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('confirm-transfer', async (event, data) => {
        try {
            const { payment_id, confirmation_note, notes: confirmNotes } = data;
            const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment_id);
            if (!payment) return { success: false, error: 'لم يتم العثور على التحويل' };

            const confirmTransaction = db.transaction(() => {
                db.prepare(`UPDATE payments SET status = 'confirmed', notes = COALESCE(notes, '') || ' |  تم تأكيد الاستلام: ' || ? WHERE id = ?`).run(confirmation_note || confirmNotes || 'تم المطابقة', payment_id);
                db.prepare(`INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at) VALUES ('confirm_transfer', 'payment', ?, ?, ?, datetime('now','localtime'))`).run(payment_id, currentUserId, 'تأكيد تحويل #' + payment_id + ' بمبلغ ' + payment.amount + '');
            });
            confirmTransaction();
            recalcInvoicePaymentStatus(payment.invoice_id);
            return { success: true, message: 'تم تأكيد التحويل' };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('reject-transfer', async (event, data) => {
        try {
            const { payment_id, rejection_note } = data;
            const result = db.transaction(() => {
                const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment_id);
                if (!payment) throw new Error('لم يتم العثور على التحويل');
                if (payment.method !== 'transfer') throw new Error('هذه الدفعة ليست تحويلاً');
                if (payment.status !== 'awaiting_transfer' && payment.status !== 'pending') throw new Error('هذه الدفعة ليست بانتظار تحويل');
                db.prepare("UPDATE payments SET method = 'debt', status = 'pending', notes = COALESCE(notes, '') || ' | تحويل لم يصل: ' || ? WHERE id = ?").run(rejection_note || 'لم يتم التحويل', payment_id);

                db.prepare("INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)").run(currentUserId, 'convert_transfer_to_debt', 'payments', payment_id, JSON.stringify({method: 'transfer', status: 'awaiting_transfer'}), JSON.stringify({method: 'debt', status: 'pending', note: rejection_note}));
                return { success: true, invoiceId: payment.invoice_id };
            })();
            recalcInvoicePaymentStatus(result.invoiceId);
            return result;
        } catch (error) { return { success: false, error: error.message }; }
    });



    ipcMain.handle('get-outstanding-debts', async () => {
        try {
            const debts = db.prepare(`
                SELECT p.id, p.invoice_id, p.amount, p.status, p.debt_reason, p.notes, p.created_at,
                    i.customer_id, i.customer_name, i.customer_phone
                FROM payments p JOIN invoices i ON p.invoice_id = i.id
                WHERE p.method = 'debt' AND p.status = 'pending' ORDER BY p.created_at DESC
            `).all();
            const totalAmount = debts.reduce((sum, d) => sum + d.amount, 0);
            return { success: true, debts, total_amount: totalAmount, count: debts.length };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== الإشعارات ====================
    ipcMain.handle('get-notifications', async (event, filters) => {
        try {
            let query = 'SELECT * FROM notifications';
            const params = [];
            if (filters && filters.unread_only) { query += ' WHERE is_read = 0'; }
            query += ' ORDER BY created_at DESC LIMIT 50';
            const notifications = db.prepare(query).all(...params);
            return { success: true, notifications };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-unread-notifications-count', async () => {
        try {
            const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get();
            return { success: true, count: result.count };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('mark-notification-read', async (event, id) => {
        try { db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id); return { success: true }; }
        catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('mark-all-notifications-read', async () => {
        try { db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run(); return { success: true }; }
        catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== التقارير ====================
    ipcMain.handle('get-daily-report', async (event, date) => {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            const invoices = db.prepare('SELECT * FROM invoices WHERE date(created_at) = ? ORDER BY created_at DESC').all(targetDate);
            const totals = db.prepare(`SELECT COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales, COALESCE(SUM(discount), 0) as total_discount FROM invoices WHERE date(created_at) = ?`).get(targetDate);
            const paymentBreakdown = db.prepare(`SELECT p.method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE date(i.created_at) = ? GROUP BY p.method`).all(targetDate);
            return { success: true, date: targetDate, invoices, totals, paymentBreakdown };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-weekly-report', async () => {
        try {
            const report = db.prepare(`SELECT date(created_at) as date, COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales FROM invoices WHERE created_at >= datetime('now', '-7 days', 'localtime') GROUP BY date(created_at) ORDER BY date DESC`).all();
            return { success: true, report };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-monthly-report', async (event, month) => {
        try {
            const targetMonth = month || new Date().toISOString().slice(0, 7);
            const report = db.prepare(`SELECT date(created_at) as date, COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales FROM invoices WHERE strftime('%Y-%m', created_at) = ? GROUP BY date(created_at) ORDER BY date DESC`).all(targetMonth);
            const totals = db.prepare(`SELECT COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales, COALESCE(SUM(discount), 0) as total_discount FROM invoices WHERE strftime('%Y-%m', created_at) = ?`).get(targetMonth);
            return { success: true, month: targetMonth, report, totals };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-product-sales-report', async (event, filters) => {
        try {
            let query = `SELECT ii.product_id, ii.product_name, SUM(ii.quantity) as total_qty, SUM(ii.total) as total_sales, COUNT(DISTINCT ii.invoice_id) as invoice_count FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id WHERE 1=1`;
            const params = [];
            if (filters && filters.date_from) { query += ' AND date(i.created_at) >= ?'; params.push(filters.date_from); }
            if (filters && filters.date_to) { query += ' AND date(i.created_at) <= ?'; params.push(filters.date_to); }
            query += ' GROUP BY ii.product_id ORDER BY total_sales DESC';
            const report = db.prepare(query).all(...params);
            return { success: true, report };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-customer-report', async (event, filters) => {
        try {
            let query = `SELECT i.customer_id, i.customer_name, COUNT(*) as invoice_count, COALESCE(SUM(i.total), 0) as total_purchases FROM invoices i WHERE i.customer_id IS NOT NULL`;
            const params = [];
            if (filters && filters.date_from) { query += ' AND date(i.created_at) >= ?'; params.push(filters.date_from); }
            if (filters && filters.date_to) { query += ' AND date(i.created_at) <= ?'; params.push(filters.date_to); }
            query += ' GROUP BY i.customer_id ORDER BY total_purchases DESC';
            const report = db.prepare(query).all(...params);
            return { success: true, report };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== الإقفال اليومي ====================
    ipcMain.handle('daily-closing', async (event, data) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const existing = db.prepare('SELECT id FROM daily_closings WHERE closing_date = ?').get(today);
            if (existing) return { success: false, error: 'تم الإقفال اليومي مسبقاً لهذا اليوم' };
            const stats = db.prepare(`SELECT COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales FROM invoices WHERE date(created_at) = date('now','localtime')`).get();
            const cashTotal = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE date(i.created_at) = date('now','localtime') AND p.method = 'cash'`).get();
            const transferTotal = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE date(i.created_at) = date('now','localtime') AND p.method IN ('transfer','wallet')`).get();
            const debtTotal = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE date(i.created_at) = date('now','localtime') AND p.method = 'debt'`).get();
            db.prepare(`INSERT INTO daily_closings (closing_date, total_sales, total_cash, total_transfer, total_debt, invoice_count, notes, closed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`).run(today, stats.total_sales, cashTotal.total, transferTotal.total, debtTotal.total, stats.invoice_count, data.notes || null, data.user_id || null);
            return { success: true, message: 'تم الإقفال اليومي' };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('save-daily-closing', async (event, data) => {
        try {
            const today = data.date || new Date().toISOString().split('T')[0];
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN actual_cash REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN expected_cash REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN cash_difference REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN closing_data TEXT DEFAULT '{}'").run(); } catch(e) {}

            const existing = db.prepare('SELECT id FROM daily_closings WHERE closing_date = ?').get(today);
            if (existing) {
                db.prepare(`UPDATE daily_closings SET total_sales=?, total_cash=?, total_transfer=?, total_debt=?, invoice_count=?, notes=?, closed_by=?, actual_cash=?, expected_cash=?, cash_difference=?, closing_data=?, created_at=datetime('now','localtime') WHERE closing_date=?`).run(
                    data.total_sales||0, data.actual_cash||0, parseFloat(data.data?JSON.parse(data.data).transfers_total:0)||0, parseFloat(data.data?JSON.parse(data.data).debts_total:0)||0,
                    data.invoice_count||0, data.notes||null, data.user_id||null, data.actual_cash||0, data.expected_cash||0, data.cash_difference||0, data.data||'{}', today);
                return { success: true, message: 'تم تحديث الإقفال اليومي' };
            }
            db.prepare(`INSERT INTO daily_closings (closing_date, total_sales, total_cash, total_transfer, total_debt, invoice_count, notes, closed_by, actual_cash, expected_cash, cash_difference, closing_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`).run(
                today, data.total_sales||0, data.actual_cash||0, parseFloat(data.data?JSON.parse(data.data).transfers_total:0)||0, parseFloat(data.data?JSON.parse(data.data).debts_total:0)||0,
                data.invoice_count||0, data.notes||null, data.user_id||null, data.actual_cash||0, data.expected_cash||0, data.cash_difference||0, data.data||'{}');
            return { success: true, message: 'تم الإقفال اليومي بنجاح' };
        } catch (error) { console.error('خطأ حفظ الإقفال:', error); return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-last-closing', async () => {
        try {
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN actual_cash REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN expected_cash REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN cash_difference REAL DEFAULT 0").run(); } catch(e) {}
            try { db.prepare("ALTER TABLE daily_closings ADD COLUMN closing_data TEXT DEFAULT '{}'").run(); } catch(e) {}
            const closing = db.prepare(`SELECT dc.*, u.display_name as user_name FROM daily_closings dc LEFT JOIN users u ON dc.closed_by = u.id ORDER BY dc.closing_date DESC, dc.created_at DESC LIMIT 1`).get();
            if (closing) {
                let cdata = {};
                try { cdata = closing.closing_data ? JSON.parse(closing.closing_data) : {}; } catch(e) { cdata = { total_sales: closing.total_sales, invoice_count: closing.invoice_count, cash_total: closing.total_cash, transfers_total: closing.total_transfer, debts_total: closing.total_debt, actual_cash: closing.actual_cash||0, expected_cash: closing.expected_cash||0, cash_difference: closing.cash_difference||0 }; }
                closing.data = cdata;
                return { success: true, closing };
            }
            return { success: true, closing: null };
        } catch (error) { console.error('خطأ جلب آخر إقفال:', error); return { success: false, error: error.message }; }
    });

    ipcMain.handle('add-audit-log', async (event, data) => {
        try {
            db.prepare(`INSERT INTO audit_log (user_id, action, details, created_at) VALUES (?, ?, ?, datetime('now','localtime'))`).run(data.user_id||null, data.action||'unknown', data.details||'');
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== المستخدمين ====================
    ipcMain.handle('get-users', async () => {
        try {
            const users = db.prepare('SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY id').all();
            return { success: true, users };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('add-user', async (event, data) => {
        try {
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username);
            if (existing) return { success: false, error: 'اسم المستخدم موجود مسبقاً' };
            db.prepare(`INSERT INTO users (username, password, password_hash, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))`).run(data.username, data.password, data.password, data.display_name, data.role||'cashier');
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('update-user', async (event, id, data) => {
        try {
            if (data.password) {
                db.prepare(`UPDATE users SET display_name=?, role=?, password=?, password_hash=?, updated_at=datetime('now','localtime') WHERE id=?`).run(data.display_name, data.role, data.password, data.password, id);
            } else {
                db.prepare(`UPDATE users SET display_name=?, role=?, updated_at=datetime('now','localtime') WHERE id=?`).run(data.display_name, data.role, id);
            }
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('toggle-user-status', async (event, id) => {
        try { db.prepare('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id); return { success: true }; }
        catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('get-audit-log', async (event, limit) => {
        try { const logs = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit||100); return { success: true, logs }; }
        catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== النسخ الاحتياطي ====================
    ipcMain.handle('backup-database', async () => {
        try {
            const { dialog } = require('electron');
            const fs = require('fs');
            const dbPath = path.join(app.getPath('userData'), 'abu-kamil-pos.db');
            const result = await dialog.showSaveDialog(mainWindow, { title: 'حفظ نسخة احتياطية', defaultPath: 'abu-kamil-backup-' + new Date().toISOString().split('T')[0] + '.db', filters: [{ name: 'Database', extensions: ['db'] }] });
            if (!result.canceled && result.filePath) { fs.copyFileSync(dbPath, result.filePath); return { success: true, path: result.filePath }; }
            return { success: false, error: 'تم الإلغاء' };
        } catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('restore-database', async () => {
        try {
            const { dialog } = require('electron');
            const fs = require('fs');
            const dbPath = path.join(app.getPath('userData'), 'abu-kamil-pos.db');
            const result = await dialog.showOpenDialog(mainWindow, { title: 'استعادة نسخة احتياطية', filters: [{ name: 'Database', extensions: ['db'] }], properties: ['openFile'] });
            if (!result.canceled && result.filePaths.length > 0) { closeDatabase(); fs.copyFileSync(result.filePaths[0], dbPath); db = initializeDatabase(); return { success: true }; }
            return { success: false, error: 'تم الإلغاء' };
        } catch (error) { return { success: false, error: error.message }; }
    });

    // ==================== المطابقة الذكية ====================
    ipcMain.handle('import-bank-statement', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const result = matchingEngine.importBankStatement(data.rows, data.headers, data.fileName);
            return { success: true, batchId: result.batchId, total: result.total, incoming: result.incoming, outgoing: result.outgoing, skipped: result.skipped, entries: result.entries };
        } catch (err) { console.error('import-bank-statement error:', err); return { success: false, error: err.message }; }
    });

    // === قراءة الاقتراحات المعلقة من matching_attempts - قراءة فقط بدون تشغيل المحرك ===
    
    
    ipcMain.handle('get-debts-for-matching', async (event, data) => {
        try {
            const debts = db.prepare(`
                SELECT p.id, p.amount, p.method, p.status, p.invoice_id,
                       i.customer_id, i.customer_name, i.total as invoice_total,
                       c.name, p.alt_account_name
                FROM payments p
                JOIN invoices i ON i.id = p.invoice_id
                LEFT JOIN customers c ON c.id = i.customer_id
                WHERE p.status IN ('awaiting_transfer','pending','pending_match')
                AND p.method IN ('transfer','debt')
                ORDER BY c.name, p.amount`).all();
            return { success: true, debts: debts };
        } catch (err) { return { success: false, error: err.message, debts: [] }; }
    });

    
    ipcMain.handle('full-test-cleanup', async () => {
        try {
            db.exec('PRAGMA foreign_keys = OFF;');
            db.prepare('DELETE FROM matching_attempts').run();
            db.prepare('DELETE FROM customer_aliases').run();
            db.prepare('DELETE FROM bank_transactions').run();
            db.prepare('DELETE FROM payments').run();
            db.prepare('DELETE FROM invoices').run();
            db.prepare('DELETE FROM daily_closings').run();
            db.prepare('DELETE FROM audit_log').run();
            db.prepare('DELETE FROM notifications').run();
            db.prepare("UPDATE sqlite_sequence SET seq=0 WHERE name IN ('matching_attempts','customer_aliases','bank_transactions','payments','invoices','daily_closings','audit_log','notifications')").run();
            db.exec('PRAGMA foreign_keys = ON;');
            return { success: true, message: 'تم التنظيف الكامل' };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('cleanup-test-invoices', async (event, ids) => {
        try {
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return { success: false, error: 'No invoice IDs provided' };
            }
            const placeholders = ids.map(() => '?').join(',');
            const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id IN (' + placeholders + ')');
            const deletePayments = db.prepare('DELETE FROM payments WHERE invoice_id IN (' + placeholders + ')');
            const deleteInvoices = db.prepare('DELETE FROM invoices WHERE id IN (' + placeholders + ')');
            
            db.transaction(() => {
                deleteItems.run(...ids);
                deletePayments.run(...ids);
                deleteInvoices.run(...ids);
            })();
            
            return { success: true, deleted: ids.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    
    ipcMain.handle('clear-old-bank-data', async () => {
        try {
            db.exec('PRAGMA foreign_keys = OFF;');
            db.prepare('DELETE FROM matching_attempts').run();
            db.prepare('DELETE FROM payment_installments').run();
            // [FIX] لا نحذف الديون عند مسح الكشوفات - الديون مستقلة عن البنك
            db.prepare("UPDATE payments SET status = 'pending', paid_amount = 0, remaining_amount = NULL WHERE status = 'partial'").run();
            db.prepare('DELETE FROM bank_transactions').run();
            db.exec('PRAGMA foreign_keys = ON;');
            console.log('[Clear] All bank data cleared successfully');
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('reset-all-bank-transactions', async () => {
        try {
            const result = db.prepare("UPDATE bank_transactions SET match_status='pending' WHERE match_status IN ('ignored','matched_manual','matched_auto')").run();
            return { success: true, count: result.changes };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('reset-ignored-transactions', async () => {
        try {
            const result = db.prepare("UPDATE bank_transactions SET match_status='pending' WHERE match_status='ignored'").run();
            return { success: true, count: result.changes };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('ignore-bank-transaction', async (event, data) => {
        try {
            const bankId = (typeof data === 'number') ? data : (data.bankTransactionId || data.id); const bt = db.prepare('SELECT * FROM bank_transactions WHERE id=?').get(bankId);
            if (!bt) return { success: false, error: 'عملية بنكية غير موجودة' };
            if (bt.match_status !== 'pending') return { success: false, error: 'هذه العملية ليست معلّقة' };
            db.prepare("UPDATE bank_transactions SET match_status='ignored' WHERE id=?").run(bankId);
            db.prepare("INSERT INTO audit_log (action, details, user_id, created_at) VALUES (?,?,?,datetime('now','localtime'))").run('ignore_bank_transaction', JSON.stringify({ bank_transaction_id: bankId, amount: bt.amount, parsed_name: bt.parsed_name, reason: (typeof data === 'object' ? data.notes : '') || '' }), (typeof data === 'object' ? data.userId : null) || null);
            return { success: true };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('delete-bank-transactions', async (event, ids) => {
        try {
            const idList = Array.isArray(ids) ? ids : [ids];
            const stmt = db.prepare('DELETE FROM bank_transactions WHERE id = ?');
            let deleted = 0;
            for (const id of idList) {
                const r = stmt.run(id);
                deleted += r.changes;
            }
            return { success: true, deleted };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-pending-matches', async () => {
        try {
            const suggested = db.prepare(`
                SELECT ma.bank_transaction_id, ma.payment_id, MAX(ma.score) as score, ma.match_level,
                       bt.parsed_name as bank_name, bt.amount as bank_amount, bt.parsed_date as bank_date, bt.id as bank_id,
                       p.amount as pay_amount, p.method, p.invoice_id,
                       c.name as customer_name
                FROM matching_attempts ma
                JOIN bank_transactions bt ON bt.id = ma.bank_transaction_id
                JOIN payments p ON p.id = ma.payment_id
                LEFT JOIN invoices i ON i.id = p.invoice_id
                LEFT JOIN customers c ON c.id = i.customer_id
                WHERE ma.decision = 'pending' AND p.status IN ('awaiting_transfer','pending','pending_match')
                GROUP BY ma.bank_transaction_id, ma.payment_id
                ORDER BY ma.bank_transaction_id, ma.payment_id
            `).all();

            if (suggested.length === 0) {
                return { success: true, suggested: [], summary: { suggested: 0 } };
            }

            const groups = {};
            for (const row of suggested) {
                const key = row.bank_transaction_id;
                if (!groups[key]) {
                    groups[key] = {
                        bank_transaction: { id: row.bank_id, name: row.bank_name, amount: row.bank_amount, date: row.bank_date },
                        payments: [],
                        score: row.score,
                        type: 'individual'
                    };
                }
                groups[key].payments.push({
                    id: row.payment_id, amount: row.pay_amount, method: row.method,
                    customer: row.customer_name, invoice_id: row.invoice_id
                });
            }

            const result = Object.values(groups);
            for (const g of result) {
                if (g.payments.length > 1) g.type = 'aggregate';
            }

            return { success: true, suggested: result, summary: { suggested: result.length } };
        } catch (err) {
            console.error('get-pending-matches error:', err);
            return { success: false, error: err.message, suggested: [], summary: { suggested: 0 } };
        }
    });

    //  WARNING: Any transfer matching MUST be followed by recalcInvoicePaymentStatus(invoice_id).
    // Skipping this step will result in inconsistent invoice payment states.
    // Do NOT update invoice payment_status manually.

    ipcMain.handle('run-matching', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const batchId = (data && data.batchId) ? data.batchId : null;
            const result = matchingEngine.runMatching(batchId);
            if (result.auto_confirmed && result.auto_confirmed.length > 0) {
                const invoiceIds = new Set();
                for (const m of result.auto_confirmed) {
                    const paymentsList = m.payments || (m.payment_id ? [{ payment_id: m.payment_id, invoice_id: m.invoice_id }] : []);
                    for (const p of paymentsList) { if (p.invoice_id) invoiceIds.add(p.invoice_id); }
                }
                for (const invId of invoiceIds) { recalcInvoicePaymentStatus(invId); }
            }
            return result;
        } catch (err) { console.error('run-matching error:', err); return { success: false, error: err.message }; }
    });


    ipcMain.handle('accept-match', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const pids = Array.isArray(data.paymentIds) ? data.paymentIds : [data.paymentId];
            const result = matchingEngine.acceptSuggestion(data.bankTransactionId, pids);
            if (result.success) {
                const invoiceIds = result.invoiceIds || [];
                if (invoiceIds.length === 0) {
                    for (const pid of pids) {
                        const pay = db.prepare('SELECT invoice_id FROM payments WHERE id=?').get(pid);
                        if (pay) invoiceIds.push(pay.invoice_id);
                    }
                }
                for (const iid of [...new Set(invoiceIds)]) {
                    if (iid) recalcInvoicePaymentStatus(iid);
                }
            }
            return result;
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('reject-match', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const pids = Array.isArray(data.paymentIds) ? data.paymentIds : [data.paymentId];
            const rejectResult = matchingEngine.rejectSuggestion(data.bankTransactionId, pids);
            try { db.prepare("UPDATE matching_attempts SET decision = 'rejected' WHERE bank_transaction_id = ?").run(data.bankTransactionId); } catch(e) {}
            return rejectResult;
        } catch (err) { return { success: false, error: err.message }; }
    });


    ipcMain.handle('manual-match', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const pids = Array.isArray(data.paymentIds) ? data.paymentIds : [data.paymentId];
            const result = matchingEngine.acceptSuggestion(data.bankTransactionId, pids);
            if (result.success) {
                const invoiceIds = result.invoiceIds || [];
                if (invoiceIds.length === 0) {
                    for (const pid of pids) {
                        const pay = db.prepare('SELECT invoice_id FROM payments WHERE id=?').get(pid);
                        if (pay) invoiceIds.push(pay.invoice_id);
                    }
                }
                for (const iid of [...new Set(invoiceIds)]) {
                    if (iid) recalcInvoicePaymentStatus(iid);
                }
            }
            return result;
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('undo-match', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const result = matchingEngine.undoMatch(data.bankTransactionId);
            if (result.success) {
                const attempts = db.prepare("SELECT DISTINCT p.invoice_id FROM matching_attempts ma JOIN payments p ON p.id=ma.payment_id WHERE ma.bank_transaction_id=?").all(data.bankTransactionId);
                for (const a of attempts) { if (a.invoice_id) recalcInvoicePaymentStatus(a.invoice_id); }
            }
            return result;
        } catch (err) { return { success: false, error: err.message }; }
    });
ipcMain.handle('add-customer-alias', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return matchingEngine.addAliasManual(data.customerId, data.aliasName);
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-customer-aliases', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return matchingEngine.getAliases(data.customerId);
        } catch (err) { return []; }
    });

    ipcMain.handle('get-matching-stats', async () => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return matchingEngine.getStats();
        } catch (err) { return {}; }
    });

    
    // ==================== Feedback & Audit APIs ====================
    ipcMain.handle('get-feedback-stats', async () => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return { success: true, stats: matchingEngine.feedback.getStats() };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-audit-trail', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return { success: true, trail: matchingEngine.feedback.getAuditTrail(data.bankTransactionId) };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('reverse-match', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return matchingEngine.feedback.reverseMatch(data.auditId, data.userId || 'user', data.reason || '');
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-aliases-for-customer', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return { success: true, aliases: matchingEngine.feedback.getAliasesForCustomer(data.customerId) };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('add-alias', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return { success: true, result: matchingEngine.feedback.createOrUpdateAlias(data.customerId, data.aliasName, data.aliasType, data.createdBy || 'user') };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('delete-alias', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            return matchingEngine.feedback.deleteAlias(data.aliasId);
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('find-customer-by-alias', async (event, data) => {
        try {
            if (!matchingEngine) matchingEngine = new MatchingEngine(db);
            const result = matchingEngine.feedback.findCustomerByAlias(data.name);
            return { success: true, customer: result };
        } catch (err) { return { success: false, error: err.message }; }
    });

    
  // === Reset payment status (admin fix) ===
  ipcMain.handle('reset-payment-status', (event, paymentId, newStatus) => {
    try {
      const db = getDatabase();
      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
      if (!payment) return { success: false, error: 'Payment not found' };
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(newStatus, paymentId);
      console.log(`[Fix] Payment #${paymentId} status: ${payment.status} -> ${newStatus}`);
      return { success: true, old_status: payment.status, new_status: newStatus };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('debug-bank-statuses', async () => {
        try {
            return db.prepare('SELECT match_status, COUNT(*) as cnt FROM bank_transactions GROUP BY match_status').all();
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('get-unmatched-bank-transactions', async () => {
        try {
            return db.prepare("SELECT * FROM bank_transactions WHERE match_status='pending' AND direction='incoming' ORDER BY parsed_date DESC").all();
        } catch (err) { return []; }
    });

    console.log(' تم تسجيل جميع IPC handlers (v6.0 - المطابقة الذكية)');
}

    // ==================== التحويلات المتأخرة ====================
    ipcMain.handle('get-overdue-transfers', async () => {
        try {
            const transfers = db.prepare(`
                SELECT p.id, p.amount, p.status, p.transfer_type, p.transfer_deadline,
                       p.alt_account_name, p.alt_account_relation, p.created_at, p.notes,
                       i.id as invoice_id, i.customer_name, i.customer_id
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE p.method = 'transfer'
                AND p.status = 'awaiting_transfer'
                AND p.transfer_deadline IS NOT NULL
                AND p.transfer_deadline < datetime('now','localtime')
                ORDER BY p.transfer_deadline ASC
            `).all();
            return { success: true, transfers };
        } catch(e) { return { success: false, error: e.message, transfers: [] }; }
    });

    // ==================== تحويل متأخر إلى دين ====================
    ipcMain.handle('convert-transfer-to-debt', async (event, paymentId) => {
        try {
            const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
            if (!payment) return { success: false, error: 'الدفعة غير موجودة' };
            db.prepare(`UPDATE payments SET method = 'debt', status = 'pending', debt_reason = 'تحويل متأخر - تحول لدين', notes = notes || '' || ' | تحول لدين بتاريخ ' || datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`).run(paymentId);
            db.prepare(`INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, created_at) VALUES ('convert_to_debt', 'payment', ?, ?, ?, datetime('now','localtime'))`).run(paymentId, null, 'تحويل متأخر تحول لدين - مبلغ: ' + payment.amount);
            return { success: true };
        } catch(e) { return { success: false, error: e.message }; }
    });

  // === API لقراءة جدول التعلم ===
  ipcMain.handle('get-learning-data', async () => {
    try {
      const rows = db.prepare('SELECT nl.*, c.name as customer_name FROM name_learning nl LEFT JOIN customers c ON c.id = nl.system_customer_id ORDER BY nl.use_count DESC').all();
      return { success: true, data: rows };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // === فحص الرقم المرجعي ===

// ==================== نظام التفعيل ====================

function openActivationWindow() {
    if (activationWindow) {
        activationWindow.focus();
        return;
    }

    activationWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload-activation.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '../../assets/icon.ico'),
        title: 'تفعيل البرنامج - أبو كميل POS',
        show: false,
        autoHideMenuBar: true
    });

    activationWindow.loadFile(path.join(__dirname, '../renderer/pages/activation.html'));
    activationWindow.once('ready-to-show', () => activationWindow.show());
    activationWindow.on('closed', () => {
        activationWindow = null;
        // إذا أُغلقت نافذة التفعيل بدون تفعيل، أقفل التطبيق
        const check = licenseManager.checkLicense();
        if (!check.valid && (!mainWindow || mainWindow.isDestroyed())) {
            app.quit();
        }
    });
}

function registerLicenseHandlers() {
    ipcMain.handle('license-get-machine-id', async () => {
        try {
            return { success: true, machineId: licenseManager.getMachineId() };
        } catch(e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('license-check', async () => {
        try {
            return licenseManager.checkLicense();
        } catch(e) { return { valid: false, error: e.message }; }
    });

    ipcMain.handle('license-activate', async (event, key) => {
        try {
            const result = licenseManager.activateLicense(key);
            return result;
        } catch(e) { return { valid: false, error: e.message }; }
    });

    ipcMain.handle('license-enter-app', async () => {
        try {
            const check = licenseManager.checkLicense();
            if (!check.valid) return { success: false, error: check.error };

            // أغلق نافذة التفعيل وافتح التطبيق
            if (activationWindow && !activationWindow.isDestroyed()) {
                activationWindow.close();
            }
            if (!mainWindow || mainWindow.isDestroyed()) {
                createWindow();
            }
            return { success: true };
        } catch(e) { return { success: false, error: e.message }; }
    });
}
