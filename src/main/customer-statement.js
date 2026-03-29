'use strict';

/**
 * كشف حساب الزبون - Customer Statement
 * يجلب كل الحركات المالية لزبون معين خلال فترة محددة
 */

function createStatementHandler(db) {

  // حساب الرصيد الافتتاحي قبل بداية الفترة
  function calculateOpeningBalance(customerId, fromDate) {
    const result = db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN p.method = 'debt' THEN p.amount
          WHEN p.method IN ('cash','transfer','wallet','card') THEN -p.amount
          ELSE 0
        END
      ), 0) as balance
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.customer_id = ?
        AND p.created_at < ?
    `).get(customerId, fromDate);

    // نضيف مبالغ الفواتير غير المدفوعة (بدون payment)
    const unpaidInvoices = db.prepare(`
      SELECT COALESCE(SUM(i.total), 0) as total
      FROM invoices i
      WHERE i.customer_id = ?
        AND i.created_at < ?
        AND i.id NOT IN (SELECT DISTINCT invoice_id FROM payments WHERE invoice_id IS NOT NULL)
    `).get(customerId, fromDate);

    return (result?.balance || 0) + (unpaidInvoices?.total || 0);
  }

  // تسمية طريقة الدفع
  function getMethodLabel(method) {
    const labels = {
      'cash': 'نقدا',
      'card': 'بطاقة',
      'transfer': 'تحويل بنكي',
      'wallet': 'محفظة إلكترونية',
      'debt': 'دين'
    };
    return labels[method] || method || '';
  }

  // تنسيق التاريخ
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${mon}/${year}`;
    } catch(e) { return dateStr; }
  }

  // الدالة الرئيسية
  function getCustomerStatement(customerId, fromDate, toDate) {
    try {
      console.log(`[Statement] customer=${customerId} from=${fromDate} to=${toDate}`);

      // 1. معلومات الزبون
      const customer = db.prepare(
        'SELECT id, name, phone, address, alt_account_name FROM customers WHERE id = ?'
      ).get(customerId);

      if (!customer) {
        return { success: false, error: 'الزبون غير موجود' };
      }

      // تعديل التواريخ لتشمل اليوم الكامل
      const fromDateTime = fromDate + ' 00:00:00';
      const toDateTime = toDate + ' 23:59:59';

      // 2. الرصيد الافتتاحي
      const openingBalance = calculateOpeningBalance(customerId, fromDateTime);
      console.log(`[Statement] Opening balance: ${openingBalance}`);

      // 3. جمع الحركات
      const transactions = [];

      // 3.1 الفواتير
      const invoices = db.prepare(`
        SELECT 
          i.id, i.total, i.created_at, i.status, i.notes,
          i.customer_name, i.discount
        FROM invoices i
        WHERE i.customer_id = ?
          AND i.created_at BETWEEN ? AND ?
        ORDER BY i.created_at
      `).all(customerId, fromDateTime, toDateTime);

      for (const inv of invoices) {
        transactions.push({
          date: inv.created_at,
          type: 'invoice',
          description: `فاتورة #${inv.id}` + (inv.discount > 0 ? ` (خصم ${inv.discount})` : ''),
          debit: inv.total,
          credit: 0,
          ref_id: inv.id
        });
      }

      // 3.2 الدفعات (كل الأنواع)
      const payments = db.prepare(`
        SELECT 
          p.id, p.invoice_id, p.amount, p.method, p.status,
          p.bank_reference, p.alt_account_name, p.notes, p.created_at,
          bt.payer_name, bt.tx_reference, bt.parsed_date as bank_date
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN bank_transactions bt ON bt.matched_payment_id = p.id
        WHERE i.customer_id = ?
          AND p.created_at BETWEEN ? AND ?
        ORDER BY p.created_at
      `).all(customerId, fromDateTime, toDateTime);

      for (const pay of payments) {
        if (pay.method === 'debt') {
          // الدين = مبلغ مستحق على الزبون (مدين)
          transactions.push({
            date: pay.created_at,
            type: 'debt',
            description: `دين - فاتورة #${pay.invoice_id}` + 
              (pay.notes ? ` (${pay.notes})` : ''),
            debit: pay.amount,
            credit: 0,
            ref_id: pay.id
          });
        } else {
          // دفعة = الزبون دفع (دائن)
          let desc = `دفع ${getMethodLabel(pay.method)}`;
          
          if (pay.payer_name && pay.tx_reference) {
            desc += ` من ${pay.payer_name} - مرجع #${pay.tx_reference}`;
          } else if (pay.payer_name) {
            desc += ` من ${pay.payer_name}`;
          } else if (pay.bank_reference) {
            desc += ` - مرجع ${pay.bank_reference}`;
          }
          
          desc += ` (فاتورة #${pay.invoice_id})`;

          // لو الدفعة ملغية أو مرفوضة
          if (pay.status === 'cancelled' || pay.status === 'rejected') {
            desc += ' [ملغي]';
            continue; // نتجاهلها
          }

          transactions.push({
            date: pay.created_at,
            type: 'payment',
            description: desc,
            debit: 0,
            credit: pay.amount,
            ref_id: pay.id
          });
        }
      }

      // 3.3 سداد ديون (payments على ديون سابقة - status changed to paid)
      // هاي بتتعامل معها تلقائيا لأن أي دفعة بتظهر كدائن

      // 3.4 الأرصدة الزائدة (من customer_credits)
      try {
        const credits = db.prepare(`
          SELECT amount, reason, created_at, status
          FROM customer_credits
          WHERE customer_id = ?
            AND created_at BETWEEN ? AND ?
        `).all(customerId, fromDateTime, toDateTime);

        for (const cr of credits) {
          transactions.push({
            date: cr.created_at,
            type: 'credit',
            description: `رصيد زائد` + (cr.reason ? `: ${cr.reason}` : '') +
              (cr.status === 'used' ? ' [مستخدم]' : ''),
            debit: 0,
            credit: cr.amount,
            ref_id: null
          });
        }
      } catch(e) { /* جدول قد لا يكون موجودا */ }

      // 3.5 الأقساط (من installments)
      try {
        const installments = db.prepare(`
          SELECT 
            inst.amount, inst.notes, inst.created_at,
            p.invoice_id
          FROM installments inst
          JOIN payments p ON p.id = inst.payment_id
          WHERE p.customer_id = ?
            AND inst.created_at BETWEEN ? AND ?
        `).all(customerId, fromDateTime, toDateTime);

        for (const inst of installments) {
          transactions.push({
            date: inst.created_at,
            type: 'installment',
            description: `قسط` + (inst.notes ? ` - ${inst.notes}` : '') +
              (inst.invoice_id ? ` (فاتورة #${inst.invoice_id})` : ''),
            debit: 0,
            credit: inst.amount,
            ref_id: null
          });
        }
      } catch(e) { /* جدول قد لا يكون موجودا */ }

      // 4. ترتيب بالتاريخ ثم مدين قبل دائن
      transactions.sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        // الفواتير أولا ثم الدفعات
        if (a.type === 'invoice' && b.type !== 'invoice') return -1;
        if (a.type !== 'invoice' && b.type === 'invoice') return 1;
        return 0;
      });

      // 5. حساب الرصيد التراكمي
      let runningBalance = openingBalance;
      const enrichedTransactions = transactions.map(txn => {
        runningBalance += txn.debit - txn.credit;
        return {
          ...txn,
          balance: Math.round(runningBalance * 100) / 100,
          formattedDate: formatDate(txn.date),
          formattedDebit: txn.debit > 0 ? txn.debit.toFixed(2) : '',
          formattedCredit: txn.credit > 0 ? txn.credit.toFixed(2) : '',
          formattedBalance: runningBalance.toFixed(2),
          balanceClass: runningBalance > 0.01 ? 'debit' : 
                        runningBalance < -0.01 ? 'credit' : 'zero'
        };
      });

      // 6. إضافة الرصيد الافتتاحي كأول سطر
      if (Math.abs(openingBalance) > 0.01) {
        enrichedTransactions.unshift({
          date: fromDate,
          type: 'opening',
          description: 'رصيد سابق (مرحل)',
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: openingBalance,
          formattedDate: formatDate(fromDate),
          formattedDebit: openingBalance > 0 ? openingBalance.toFixed(2) : '',
          formattedCredit: openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : '',
          formattedBalance: openingBalance.toFixed(2),
          balanceClass: openingBalance > 0.01 ? 'debit' : 'credit',
          ref_id: null
        });
      }

      // 7. الملخص
      const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
      const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
      const finalBalance = openingBalance + totalDebit - totalCredit;

      const paymentsByMethod = {};
      for (const pay of payments) {
        if (pay.method !== 'debt') {
          const label = getMethodLabel(pay.method);
          paymentsByMethod[label] = (paymentsByMethod[label] || 0) + pay.amount;
        }
      }

      const summary = {
        openingBalance: Math.round(openingBalance * 100) / 100,
        totalPurchases: Math.round(invoices.reduce((s, inv) => s + inv.total, 0) * 100) / 100,
        totalPayments: Math.round(totalCredit * 100) / 100,
        totalDebts: Math.round(payments.filter(p => p.method === 'debt').reduce((s, p) => s + p.amount, 0) * 100) / 100,
        finalBalance: Math.round(finalBalance * 100) / 100,
        invoiceCount: invoices.length,
        paymentCount: payments.filter(p => p.method !== 'debt').length,
        debtCount: payments.filter(p => p.method === 'debt').length,
        paymentsByMethod: paymentsByMethod,
        balanceStatus: finalBalance > 0.01 ? 'عليه' : 
                       finalBalance < -0.01 ? 'له رصيد زائد' : 'مسدد'
      };

      console.log(`[Statement] ${enrichedTransactions.length} transactions, final=${finalBalance}`);

      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone || '',
          address: customer.address || '',
          alt_name: customer.alt_account_name || ''
        },
        period: {
          from: fromDate,
          to: toDate,
          formattedFrom: formatDate(fromDate),
          formattedTo: formatDate(toDate)
        },
        transactions: enrichedTransactions,
        summary: summary,
        generatedAt: new Date().toISOString(),
        formattedGeneratedAt: formatDate(new Date().toISOString())
      };

    } catch (err) {
      console.error('[Statement] Error:', err);
      return { success: false, error: err.message };
    }
  }

  return { getCustomerStatement, calculateOpeningBalance, formatDate };
}

module.exports = { createStatementHandler };
