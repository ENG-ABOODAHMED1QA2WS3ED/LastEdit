const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let c = fs.readFileSync(filePath, 'utf8');

let fixes = 0;

// FIX 2: Buttons - use allPaymentIds for grouped
const oldBtn = "  let btns = '';\n  if (type === 'suggestion') {\n    btns = '<button class=\"btn btn-success\" data-action=\"accept\" data-bank-id=\"' + bankId + '\" data-payment-ids=\"' + paymentId + '\"> قبول</button>' +\n           '<button class=\"btn btn-danger\" data-action=\"reject\" data-bank-id=\"' + bankId + '\" data-payment-ids=\"' + paymentId + '\"> رفض</button>';";
const newBtn = "  let btns = '';\n  const allPaymentIds = (m.payment_ids && m.payment_ids.length > 0) ? m.payment_ids.join(',') : paymentId;\n  if (type === 'suggestion') {\n    btns = '<button class=\"btn btn-success\" data-action=\"accept\" data-bank-id=\"' + bankId + '\" data-payment-ids=\"' + allPaymentIds + '\"> قبول</button>' +\n           '<button class=\"btn btn-danger\" data-action=\"reject\" data-bank-id=\"' + bankId + '\" data-payment-ids=\"' + allPaymentIds + '\"> رفض</button>';";

if (c.includes(oldBtn)) {
  c = c.replace(oldBtn, newBtn);
  fixes++;
  console.log('FIX 2: Buttons now send all grouped payment IDs');
} else {
  console.log('WARN FIX 2: trying line-by-line approach');
  // Replace just the paymentId references in buttons
  const btnLine1 = "data-payment-ids=\"' + paymentId + '\"> قبول</button>'";
  const btnLine1New = "data-payment-ids=\"' + ((m.payment_ids && m.payment_ids.length > 0) ? m.payment_ids.join(',') : paymentId) + '\"> قبول</button>'";
  if (c.includes(btnLine1)) {
    c = c.replace(btnLine1, btnLine1New);
    // Also fix reject button
    c = c.replace(
      "data-payment-ids=\"' + paymentId + '\"> رفض</button>'",
      "data-payment-ids=\"' + ((m.payment_ids && m.payment_ids.length > 0) ? m.payment_ids.join(',') : paymentId) + '\"> رفض</button>'"
    );
    fixes++;
    console.log('FIX 2: Applied line-level button fix');
  } else {
    console.log('ERROR FIX 2: Could not find button code');
  }
}

// FIX 3: Add grouped invoices display before alternatives
const oldAlt = "  // بدائل\n  let altHtml = '';";
const groupedBlock = `  // فواتير مجمعة
  let groupedHtml = '';
  if (m.match_type === 'grouped_complementary' && m.grouped_payments && m.grouped_payments.length > 0) {
    const totalGrouped = m.grouped_payments.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
    groupedHtml = '<div class="grouped-invoices-box">' +
      '<div class="grouped-title">\\u2709 فواتير مجمعة (' + m.grouped_payments.length + ')</div>';
    m.grouped_payments.forEach(function(gp, idx) {
      groupedHtml += '<div class="grouped-invoice-item">' +
        '<span class="gi-num">' + (idx + 1) + '.</span> ' +
        '<span class="gi-name">' + (gp.customer_name || '') + '</span> - ' +
        '<span class="gi-amount">' + (gp.amount || 0) + ' \\u20AA</span>' +
      '</div>';
    });
    groupedHtml += '<div class="grouped-invoice-total">\\u2211 المجموع: ' + totalGrouped + ' \\u20AA' +
      (bt.amount && Math.abs(bt.amount - totalGrouped) < 0.5 ? ' = مبلغ التحويل \\u2714' : '') +
      '</div></div>';
  }

  // بدائل
  let altHtml = '';`;

if (c.includes(oldAlt)) {
  c = c.replace(oldAlt, groupedBlock);
  fixes++;
  console.log('FIX 3: Added grouped invoices display');
} else {
  console.log('ERROR FIX 3: alternatives section not found');
}

// FIX 4: Insert groupedHtml into return template
// Looking at the actual template structure (line 685+)
const oldReturn = "    '</div>' +\n\n    partialHtml +";
const newReturn = "    '</div>' +\n\n    groupedHtml +\n    partialHtml +";

if (c.includes(oldReturn)) {
  c = c.replace(oldReturn, newReturn);
  fixes++;
  console.log('FIX 4: groupedHtml inserted into card template');
} else {
  // Try after breakdown section
  if (c.includes('partialHtml +')) {
    c = c.replace('partialHtml +', 'groupedHtml +\n    partialHtml +');
    fixes++;
    console.log('FIX 4: groupedHtml inserted before partialHtml');
  } else {
    console.log('WARN FIX 4: trying after altHtml');
    if (c.includes('altHtml +')) {
      c = c.replace('altHtml +', 'groupedHtml +\n    altHtml +');
      fixes++;
      console.log('FIX 4: groupedHtml inserted before altHtml');
    }
  }
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('\nTotal fixes applied:', fixes);
console.log('Run npm start to test');
