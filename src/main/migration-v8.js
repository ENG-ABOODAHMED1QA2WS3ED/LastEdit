'use strict';

/**
 * Migration v8.0  إضافة أعمدة للمطابقة الذكية
 * يعمل مرة واحدة عند بدء التطبيق
 * آمن: try/catch لكل ALTER  إذا العمود موجود يتجاهله
 */
function runMigrationV8(db) {
    console.log('[Migration v8] بدء فحص الأعمدة...');
    let added = 0, skipped = 0;

    //  bank_transactions  أعمدة جديدة 
    const bankCols = [
        ['wallet_alias',          'TEXT'],
        ['name_candidates_json',  'TEXT'],
        ['transaction_type',      "TEXT DEFAULT 'P2P'"],
        ['payer_name',            'TEXT'],
        ['payer_name_normalized', 'TEXT']
    ];

    for (const [col, type] of bankCols) {
        try {
            db.prepare(`ALTER TABLE bank_transactions ADD COLUMN ${col} ${type}`).run();
            console.log(`   bank_transactions.${col}  أُضيف`);
            added++;
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                skipped++;
            } else {
                console.error(`   bank_transactions.${col}:`, e.message);
            }
        }
    }

    //  payments  أعمدة الدفع الجزئي 
    const paymentCols = [
        ['paid_amount', 'REAL DEFAULT 0'],
        ['due_date',    'TEXT']
    ];

    for (const [col, type] of paymentCols) {
        try {
            db.prepare(`ALTER TABLE payments ADD COLUMN ${col} ${type}`).run();
            console.log(`   payments.${col}  أُضيف`);
            added++;
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                skipped++;
            } else {
                console.error(`   payments.${col}:`, e.message);
            }
        }
    }

    //  matching_attempts  أعمدة التسجيل الموسّع 
    const attemptCols = [
        ['is_partial',       'INTEGER DEFAULT 0'],
        ['paid_amount',      'REAL'],
        ['remaining_amount', 'REAL'],
        ['breakdown_json',   'TEXT']
    ];

    for (const [col, type] of attemptCols) {
        try {
            db.prepare(`ALTER TABLE matching_attempts ADD COLUMN ${col} ${type}`).run();
            console.log(`   matching_attempts.${col}  أُضيف`);
            added++;
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                skipped++;
            } else {
                console.error(`   matching_attempts.${col}:`, e.message);
            }
        }
    }

    //  مزامنة paid_amount للفواتير القائمة 
    // أي فاتورة status='paid' يجب أن يكون paid_amount = amount
    try {
        const synced = db.prepare(`
            UPDATE payments SET paid_amount = amount 
            WHERE status = 'paid' AND (paid_amount IS NULL OR paid_amount = 0)
        `).run();
        if (synced.changes > 0) {
            console.log(`   مزامنة paid_amount لـ ${synced.changes} فاتورة مدفوعة`);
        }
    } catch (e) { /* ignore */ }

    //  تنظيف البيانات القديمة الخاطئة 
    // الاستيراد القديم أخذ الرصيد بدل المبلغ  نحذف كل شيء ونعيد الاستيراد
    try {
        const oldCount = db.prepare('SELECT COUNT(*) as cnt FROM bank_transactions').get();
        if (oldCount.cnt > 0) {
            // فحص: هل المبالغ تبدو خاطئة؟ (رصيد بدل مبلغ)
            const suspicious = db.prepare(`
                SELECT COUNT(*) as cnt FROM bank_transactions 
                WHERE amount > 1000 AND match_status = 'unmatched'
            `).get();
            
            if (suspicious.cnt > oldCount.cnt * 0.3) {
                // أكثر من 30% مبالغ كبيرة  الاستيراد القديم خاطئ
                console.log(`   ${suspicious.cnt}/${oldCount.cnt} مبالغ مشبوهة  يُنصح بإعادة الاستيراد`);
            }
        }
    } catch (e) { /* ignore */ }

    console.log(`[Migration v8]  انتهى  أُضيف: ${added} | موجود مسبقاً: ${skipped}`);
    return { added, skipped };
}

module.exports = { runMigrationV8 };