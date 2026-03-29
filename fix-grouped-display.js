const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let c = fs.readFileSync(filePath, 'utf8');

// The actual lines are:
// "  // بدائل\n  let altHtml = '';"
// But with exact encoding. Let's use indexOf approach.

const marker = "let altHtml = '';";
const idx = c.indexOf(marker);
if (idx === -1) {
  console.log('ERROR: altHtml declaration not found');
  process.exit(1);
}

// Find the comment line before it
const beforeIdx = c.lastIndexOf('\n', idx);
const commentStart = c.lastIndexOf('\n', beforeIdx - 1);
const insertPoint = commentStart + 1; // right before "  // بدائل"

const groupedCode = `  // فواتير مجمعة
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

`;

c = c.substring(0, insertPoint) + groupedCode + c.substring(insertPoint);

fs.writeFileSync(filePath, c, 'utf8');
console.log('SUCCESS: groupedHtml variable + display logic added');
console.log('Line inserted before alternatives section');

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('groupedHtml defined:', verify.includes('let groupedHtml'));
console.log('groupedHtml in template:', verify.includes('groupedHtml +'));
console.log('grouped-invoices-box:', verify.includes('grouped-invoices-box'));
