const fs = require('fs');
const path = 'src/renderer/scripts/matching.js';
let content = fs.readFileSync(path, 'utf8');
fs.writeFileSync(path + '.bak', content, 'utf8');

// FIX 1: Add grouped_complementary to type labels (line 608)
content = content.replace(
  "const typeLabels = { full: 'كاملة', partial: 'جزئية', over: 'زيادة' };",
  "const typeLabels = { full: 'كاملة', partial: 'جزئية', over: 'زيادة', grouped_complementary: 'مجمعة' };"
);

// FIX 2: Replace the buttons section to handle grouped payments
// Old: sends single paymentId
const oldBtns = `  // أزرار
  let btns = '';
  if (type === 'suggestion') {
    btns = '<button class="btn btn-success" data-action="accept" data-bank-id="' + bankId + '" data-payment-ids="' + paymentId + '"> قبول</button>' +
           '<button class="btn btn-danger" data-action="reject" data-bank-id="' + bankId + '" data-payment-ids="' + paymentId + '"> رفض</button>';
  } else if (type === 'auto') {
    btns = '<button class="btn btn-outline" data-action="undo" data-bank-id="' + bankId + '"> تراجع</button>';
  }`;

const newBtns = `  // أزرار
  let btns = '';
  // For grouped matches, send ALL payment IDs
  const allPaymentIds = (m.payment_ids && m.payment_ids.length > 0) ? m.payment_ids.join(',') : paymentId;
  if (type === 'suggestion') {
    btns = '<button class="btn btn-success" data-action="accept" data-bank-id="' + bankId + '" data-payment-ids="' + allPaymentIds + '"> قبول</button>' +
           '<button class="btn btn-danger" data-action="reject" data-bank-id="' + bankId + '" data-payment-ids="' + allPaymentIds + '"> رفض</button>';
  } else if (type === 'auto') {
    btns = '<button class="btn btn-outline" data-action="undo" data-bank-id="' + bankId + '"> تراجع</button>';
  }`;

if (content.includes(oldBtns)) {
  content = content.replace(oldBtns, newBtns);
  console.log('FIX 2: Buttons now send all grouped payment IDs');
} else {
  console.log('WARN: Buttons block not found exactly');
}

// FIX 3: Add grouped invoices display after partial box and before alternatives
// Insert a new section that shows grouped invoices when match_type is grouped_complementary
const oldPartialSection = `  // بدائل
  let altHtml = '';`;

const newPartialSection = `  // فواتير مجمعة
  let groupedHtml = '';
  if (m.match_type === 'grouped_complementary' && m.grouped_payments && m.grouped_payments.length > 0) {
    const totalGrouped = m.grouped_payments.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
    groupedHtml = '<div class="grouped-invoices-box">' +
      '<div class="grouped-title">فواتير مجمعة (' + m.grouped_payments.length + ')</div>';
    m.grouped_payments.forEach(function(gp, idx) {
      groupedHtml += '<div class="grouped-invoice-item">' +
        '<span class="gi-num">' + (idx + 1) + '.</span> ' +
        '<span class="gi-name">' + (gp.customer_name || '') + '</span> - ' +
        '<span class="gi-amount">' + (gp.amount || 0) + ' \\u20AA</span>' +
      '</div>';
    });
    groupedHtml += '<div class="grouped-invoice-total">المجموع: ' + totalGrouped + ' \\u20AA' +
      (m.total_grouped_amount && Math.abs(bt.amount - totalGrouped) < 0.01 ? ' = مبلغ التحويل \\u2714' : '') +
      '</div></div>';
  }

  // بدائل
  let altHtml = '';`;

if (content.includes(oldPartialSection)) {
  content = content.replace(oldPartialSection, newPartialSection);
  console.log('FIX 3: Added grouped invoices display section');
} else {
  console.log('WARN: Partial section insertion point not found');
}

// FIX 4: Insert groupedHtml into the card template
// Add it after partialHtml and before altHtml in the return statement
content = content.replace(
  "partialHtml +\n    altHtml +",
  "partialHtml +\n    groupedHtml +\n    altHtml +"
);
if (content.includes('groupedHtml +')) {
  console.log('FIX 4: groupedHtml inserted into card template');
} else {
  // Try alternate format
  content = content.replace(
    "partialHtml + altHtml +",
    "partialHtml + groupedHtml + altHtml +"
  );
  if (content.includes('groupedHtml +')) {
    console.log('FIX 4: groupedHtml inserted (alternate format)');
  } else {
    console.log('WARN: Could not insert groupedHtml into template');
  }
}

// FIX 5: Also update the payment side to show total when grouped
const oldPaymentSide = "'<h4> الفاتورة</h4>' +";
const newPaymentSide = "'<h4>' + (m.match_type === 'grouped_complementary' ? ' الفواتير المجمعة' : ' الفاتورة') + '</h4>' +";
content = content.replace(oldPaymentSide, newPaymentSide);
console.log('FIX 5: Payment side header updated for grouped');

fs.writeFileSync(path, content, 'utf8');
console.log('\nAll fixes applied! Run npm start to test.');
