const fs = require('fs');
const cssPath = 'src/renderer/styles/matching.css';
let css = fs.readFileSync(cssPath, 'utf8');

const newStyles = `
/* === Grouped Invoices Display === */
.grouped-invoices-box {
  background: #e8f5e9;
  border: 2px solid #4caf50;
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
}
.grouped-title {
  font-weight: bold;
  font-size: 14px;
  color: #2e7d32;
  margin-bottom: 8px;
  text-align: right;
}
.grouped-invoice-item {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 6px 8px;
  background: white;
  border-radius: 4px;
  margin: 4px 0;
  direction: rtl;
}
.gi-num { color: #666; font-weight: bold; }
.gi-name { color: #333; }
.gi-amount { color: #2e7d32; font-weight: bold; }
.grouped-invoice-total {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 2px solid #4caf50;
  text-align: center;
  font-weight: bold;
  font-size: 15px;
  color: #1b5e20;
}
`;

css += newStyles;
fs.writeFileSync(cssPath, css, 'utf8');
console.log('CSS styles added for grouped invoices');
