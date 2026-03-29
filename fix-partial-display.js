const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let c = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.bak2', c, 'utf8');

let fixes = 0;

// FIX: Enhance partialHtml section to also handle grouped_complementary with shortage
// Current code (line 625-634):
//   if (m.match_type === 'partial' && m.shortage_amount > 0)
// Need to ALSO show shortage when:
//   1. match_type is 'partial' (existing - works)
//   2. match_type is 'grouped_complementary' but total < bank amount (new)
//   3. ANY match where bank amount < total invoice amount (new)

const oldPartial = `  // دفعة جزئية
  let partialHtml = '';
  if (m.match_type === 'partial' && m.shortage_amount > 0) {
    const pct = m.invoice_amount > 0 ? ((m.shortage_amount / m.invoice_amount) * 100).toFixed(1) : '0';
    partialHtml = '<div class="partial-box ' + secClass + '">' +
      '<div class="partial-title">' + secIcon + ' دفعة جزئية</div>' +
      '<div class="partial-nums">المطلوب: ' + (m.invoice_amount||0).toFixed(2) + ' | المحوّل: ' + (m.amount_paid||0).toFixed(2) + ' | نقص: ' + (m.shortage_amount||0).toFixed(2) + '</div>' +
      '<div class="security-tag ' + secClass + '">' + secIcon + ' ' + secText + ' (نقص ' + pct + '%)</div>' +
      '</div>';
  }`;

const newPartial = `  // دفعة جزئية
  let partialHtml = '';
  // Calculate shortage for all match types
  let effectiveShortage = m.shortage_amount || 0;
  let effectiveInvoiceTotal = m.invoice_amount || 0;
  let effectivePaid = m.amount_paid || (bt.amount || 0);

  // For grouped matches: check if total invoices > bank transfer
  if (m.match_type === 'grouped_complementary' && m.grouped_payments && m.grouped_payments.length > 0) {
    effectiveInvoiceTotal = m.total_grouped_amount || m.grouped_payments.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
    effectivePaid = bt.amount || 0;
    effectiveShortage = Math.max(0, effectiveInvoiceTotal - effectivePaid);
  }

  if (effectiveShortage > 0.5) {
    const pct = effectiveInvoiceTotal > 0 ? ((effectiveShortage / effectiveInvoiceTotal) * 100).toFixed(1) : '0';
    const paidPct = effectiveInvoiceTotal > 0 ? (((effectiveInvoiceTotal - effectiveShortage) / effectiveInvoiceTotal) * 100).toFixed(0) : '0';

    // Determine severity
    let shortSec = 'safe', shortIcon = '', shortText = '';
    const shortagePctNum = parseFloat(pct);
    if (shortagePctNum <= 10) { shortSec = 'safe'; shortText = 'نقص بسيط'; }
    else if (shortagePctNum <= 30) { shortSec = 'warning'; shortText = 'نقص متوسط'; }
    else { shortSec = 'danger'; shortText = 'نقص كبير'; }

    partialHtml = '<div class="partial-box ' + shortSec + '">' +
      '<div class="partial-title">\\u26A0 دفعة جزئية - ' + shortText + '</div>' +
      '<div class="partial-nums">' +
        '<div class="partial-row">المطلوب: <strong>' + effectiveInvoiceTotal.toFixed(2) + ' \\u20AA</strong></div>' +
        '<div class="partial-row">المحوّل: <strong>' + effectivePaid.toFixed(2) + ' \\u20AA</strong></div>' +
        '<div class="partial-row shortage-highlight">الباقي على الزبون: <strong>' + effectiveShortage.toFixed(2) + ' \\u20AA</strong></div>' +
      '</div>' +
      '<div class="partial-progress">' +
        '<div class="partial-bar" style="width:' + paidPct + '%"></div>' +
        '<span class="partial-pct">' + paidPct + '% مدفوع</span>' +
      '</div>' +
      '<div class="security-tag ' + shortSec + '">\\u26A0 ' + shortText + ' (' + pct + '% نقص) - سيبقى كدين على الزبون</div>' +
      '</div>';
  } else if (m.match_type === 'partial' && m.shortage_amount > 0) {
    // Fallback to original logic for edge cases
    const pct = m.invoice_amount > 0 ? ((m.shortage_amount / m.invoice_amount) * 100).toFixed(1) : '0';
    partialHtml = '<div class="partial-box ' + secClass + '">' +
      '<div class="partial-title">' + secIcon + ' دفعة جزئية</div>' +
      '<div class="partial-nums">المطلوب: ' + (m.invoice_amount||0).toFixed(2) + ' | المحوّل: ' + (m.amount_paid||0).toFixed(2) + ' | نقص: ' + (m.shortage_amount||0).toFixed(2) + '</div>' +
      '<div class="security-tag ' + secClass + '">' + secIcon + ' ' + secText + ' (نقص ' + pct + '%)</div>' +
      '</div>';
  }`;

if (c.includes(oldPartial)) {
  c = c.replace(oldPartial, newPartial);
  fixes++;
  console.log('FIX 1: Enhanced partial payment display for all match types');
} else {
  console.log('ERROR FIX 1: partial section not found exactly');
  // Show what we have
  const idx = c.indexOf('let partialHtml');
  if (idx > -1) console.log('Found at:', idx, c.substring(idx, idx + 100));
}

fs.writeFileSync(filePath, c, 'utf8');

// Add CSS for new partial display
const cssPath = 'src/renderer/styles/matching.css';
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('partial-progress')) {
  css += `
/* === Enhanced Partial Payment Display === */
.partial-box {
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  direction: rtl;
}
.partial-box.safe { background: #fff3e0; border: 2px solid #ff9800; }
.partial-box.warning { background: #fff3e0; border: 2px solid #f57c00; }
.partial-box.danger { background: #ffebee; border: 2px solid #f44336; }
.partial-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 8px;
  text-align: right;
}
.partial-box.safe .partial-title { color: #e65100; }
.partial-box.warning .partial-title { color: #e65100; }
.partial-box.danger .partial-title { color: #c62828; }
.partial-nums { margin: 8px 0; }
.partial-row {
  padding: 4px 8px;
  font-size: 13px;
  text-align: right;
}
.shortage-highlight {
  background: #ffcdd2;
  border-radius: 4px;
  color: #c62828;
  font-size: 14px;
  padding: 6px 8px;
  margin-top: 4px;
}
.partial-progress {
  position: relative;
  height: 24px;
  background: #ffcdd2;
  border-radius: 12px;
  margin: 8px 0;
  overflow: hidden;
}
.partial-bar {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #66bb6a);
  border-radius: 12px;
  transition: width 0.5s;
}
.partial-pct {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: bold;
  color: #333;
}
.security-tag {
  text-align: center;
  padding: 6px;
  border-radius: 4px;
  font-size: 12px;
  margin-top: 8px;
}
.security-tag.safe { background: #fff3e0; color: #e65100; }
.security-tag.warning { background: #fff3e0; color: #e65100; }
.security-tag.danger { background: #ffcdd2; color: #c62828; }
`;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('FIX 2: CSS styles added for enhanced partial display');
  fixes++;
}

console.log('\nTotal fixes:', fixes);
console.log('Run npm start to test');
