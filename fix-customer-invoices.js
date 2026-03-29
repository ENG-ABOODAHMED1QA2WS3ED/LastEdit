const fs = require('fs');
const path = require('path');

console.log('================================================');
console.log('  FIX: Show ALL customer invoices in match card  ');
console.log('================================================\n');

const enginePath = path.join('src', 'main', 'matching-engine.js');
let code = fs.readFileSync(enginePath, 'utf8');
fs.writeFileSync(enginePath + '.bak-custinfo', code);

// Find the section where single match suggestion is pushed (line ~1070-1079)
// This is the "Exact or smaller amount - single match" block
const oldSingleMatch = `            // Exact or smaller amount - single match
            suggested.push({
              ...formatMatch(best),
              confidence_note: best.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD ? 'high_confidence' : 'normal',
              alternatives: layer2Results.slice(1, 3).map(r => formatMatch(r))
            });`;

const newSingleMatch = `            // Exact or smaller amount - single match
            // ENHANCEMENT: Find ALL invoices for this customer to show full picture
            let allCustomerInvoices = [];
            try {
              const custId = best.payment.customer_id;
              const custName = (best.payment.customer_name || '').trim();
              if (custId || custName) {
                allCustomerInvoices = pendingPayments.filter(p => {
                  if (usedPaymentIds.has(p.id) && p.id !== best.payment.id) return false;
                  return (custId && p.customer_id === custId) ||
                         (custName && p.customer_name && p.customer_name.trim() === custName);
                }).map(p => ({
                  id: p.id,
                  invoice_id: p.invoice_id || p._invoice_id,
                  amount: p.total_amount || p.amount || 0,
                  customer_name: p.customer_name
                }));
              }
            } catch(e) { /* ignore */ }

            const totalCustomerInvoices = allCustomerInvoices.reduce((s, inv) => s + inv.amount, 0);
            const bankAmount = bankTxn.amount;
            const totalShortage = totalCustomerInvoices - bankAmount;

            suggested.push({
              ...formatMatch(best),
              confidence_note: best.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD ? 'high_confidence' : 'normal',
              alternatives: layer2Results.slice(1, 3).map(r => formatMatch(r)),
              // Customer invoice summary
              all_customer_invoices: allCustomerInvoices.length > 1 ? allCustomerInvoices : undefined,
              total_customer_invoices_amount: allCustomerInvoices.length > 1 ? totalCustomerInvoices : undefined,
              total_shortage_all_invoices: allCustomerInvoices.length > 1 ? totalShortage : undefined,
            });

            if (allCustomerInvoices.length > 1) {
              console.log('[Match] Customer', best.payment.customer_name, 'has', allCustomerInvoices.length, 
                'invoices totaling', totalCustomerInvoices, 'vs transfer', bankAmount, 
                '| Total shortage:', totalShortage);
            }`;

const oldCode = code;
code = code.replace(oldSingleMatch, newSingleMatch);
if (code !== oldCode) {
    console.log('\x1b[32m✓ Engine: Customer invoice summary added to single matches\x1b[0m');
} else {
    console.log('\x1b[33m⚠ Engine: Exact match failed, trying flexible...\x1b[0m');
    // Try matching with flexible whitespace
    code = code.replace(
        /(\/\/ Exact or smaller amount.*\n\s*suggested\.push\(\{[\s\S]*?alternatives:.*\n\s*\}\);)/,
        newSingleMatch
    );
    if (code !== oldCode) {
        console.log('\x1b[32m✓ Engine: Customer invoice summary added (flex match)\x1b[0m');
    } else {
        console.log('\x1b[31m✗ Engine: Could not find insertion point\x1b[0m');
    }
}

fs.writeFileSync(enginePath, code, 'utf8');

// ============================================
// FILE 2: Update UI to show all customer invoices
// ============================================
const uiPath = path.join('src', 'renderer', 'scripts', 'matching.js');
let ui = fs.readFileSync(uiPath, 'utf8');
fs.writeFileSync(uiPath + '.bak-custinfo', ui);

// Add customer invoices display section
const custInvoicesHtml = `
  // === All Customer Invoices Summary ===
  let custInvoicesHtml = '';
  if (m.all_customer_invoices && m.all_customer_invoices.length > 1) {
    const totalInv = m.total_customer_invoices_amount || 0;
    const totalShortage = m.total_shortage_all_invoices || 0;
    const bankAmt = m.bankTxn ? m.bankTxn.amount : (m.amount_paid || 0);
    
    custInvoicesHtml = '<div class="customer-invoices-box">' +
      '<div class="cust-inv-title">\u062C\u0645\u064A\u0639 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0632\u0628\u0648\u0646</div>';
    
    m.all_customer_invoices.forEach(function(inv, i) {
      const isMatched = inv.id === m.payment_id;
      custInvoicesHtml += '<div class="cust-inv-item' + (isMatched ? ' matched' : '') + '">' +
        '\u0641\u0627\u062A\u0648\u0631\u0629 ' + (inv.invoice_id || (i+1)) + ': <strong>' + inv.amount.toFixed(2) + ' \u20AA</strong>' +
        (isMatched ? ' \u2190 \u0645\u0637\u0627\u0628\u0642\u0629' : '') +
        '</div>';
    });
    
    custInvoicesHtml += '<div class="cust-inv-summary">' +
      '\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631: <strong>' + totalInv.toFixed(2) + ' \u20AA</strong> | ' +
      '\u0627\u0644\u0645\u062D\u0648\u0651\u0644: <strong>' + bankAmt.toFixed ? bankAmt.toFixed(2) : bankAmt + ' \u20AA</strong>';
    
    if (totalShortage > 0) {
      custInvoicesHtml += ' | <span class="total-shortage">\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0646\u0642\u0635: ' + totalShortage.toFixed(2) + ' \u20AA</span>';
    } else if (totalShortage < 0) {
      custInvoicesHtml += ' | <span class="total-excess">\u0632\u064A\u0627\u062F\u0629: ' + Math.abs(totalShortage).toFixed(2) + ' \u20AA</span>';
    }
    
    custInvoicesHtml += '</div></div>';
  }`;

// Insert before multiTransferHtml or partialHtml
const oldUI = ui;
ui = ui.replace(
    /(let multiTransferHtml)/,
    custInvoicesHtml + '\n  $1'
);
if (ui !== oldUI) {
    console.log('\x1b[32m✓ UI: Customer invoices HTML added\x1b[0m');
} else {
    // Try before partialHtml
    ui = ui.replace(
        /(let partialHtml\s*=)/,
        custInvoicesHtml + '\n  $1'
    );
    if (ui !== oldUI) {
        console.log('\x1b[32m✓ UI: Customer invoices HTML added (before partialHtml)\x1b[0m');
    } else {
        console.log('\x1b[31m✗ UI: Could not add customer invoices HTML\x1b[0m');
    }
}

// Add custInvoicesHtml to card template
const oldUI2 = ui;
ui = ui.replace(
    /multiTransferHtml\s*\+/,
    'multiTransferHtml +\n      custInvoicesHtml +'
);
if (ui !== oldUI2) {
    console.log('\x1b[32m✓ UI: custInvoicesHtml added to template\x1b[0m');
} else {
    // Try adding before partialHtml in template
    ui = ui.replace(
        /partialHtml\s*\+/,
        'custInvoicesHtml +\n      partialHtml +'
    );
    if (ui !== oldUI2) {
        console.log('\x1b[32m✓ UI: custInvoicesHtml added before partialHtml\x1b[0m');
    }
}

fs.writeFileSync(uiPath, ui, 'utf8');

// ============================================
// FILE 3: Add CSS
// ============================================
const cssPath = path.join('src', 'renderer', 'styles', 'matching.css');
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('customer-invoices-box')) {
    css += `

/* === Customer All Invoices Summary === */
.customer-invoices-box {
    border: 2px solid #9C27B0;
    border-radius: 10px;
    padding: 12px 16px;
    margin: 10px 0;
    background: linear-gradient(135deg, #F3E5F5, #E1BEE7);
}
.cust-inv-title {
    font-weight: bold;
    color: #6A1B9A;
    font-size: 1.05em;
    margin-bottom: 8px;
    text-align: right;
}
.cust-inv-item {
    padding: 4px 8px;
    margin: 3px 0;
    background: rgba(255,255,255,0.7);
    border-radius: 6px;
    text-align: right;
    border-right: 3px solid #9C27B0;
}
.cust-inv-item.matched {
    background: rgba(156, 39, 176, 0.15);
    border-right-color: #4CAF50;
    font-weight: bold;
}
.cust-inv-summary {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #CE93D8;
    text-align: right;
    font-size: 1.05em;
}
.total-shortage {
    color: #C62828;
    font-weight: bold;
    background: #FFEBEE;
    padding: 2px 8px;
    border-radius: 4px;
}
.total-excess {
    color: #2E7D32;
    font-weight: bold;
    background: #E8F5E9;
    padding: 2px 8px;
    border-radius: 4px;
}
`;
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log('\x1b[32m✓ CSS: Customer invoices styles added\x1b[0m');
}

console.log('\n================================================');
console.log('  DONE! Expected for Samir:');
console.log('  Card will show:');
console.log('    جميع فواتير الزبون:');
console.log('    فاتورة 119: 20₪ ← مطابقة');
console.log('    فاتورة 116: 4₪');
console.log('    مجموع الفواتير: 24₪ | المحوّل: 18₪ | إجمالي النقص: 6₪');
console.log('================================================');
