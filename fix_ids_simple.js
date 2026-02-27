const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
let code = fs.readFileSync(f, 'utf8');

// Fix button IDs
code = code.replace(/getElementById\("btnPrintReport"\)/g, 'getElementById("btnPrintClosing")');
code = code.replace(/getElementById\("btnExportCSV"\)/g, 'getElementById("btnExportClosing")');

// Fix section IDs
code = code.replace(/getElementById\("todayDebts"\)/g, 'getElementById("newDebtsSection")');
code = code.replace(/getElementById\("previousClosing"\)/g, 'getElementById("previousClosingInfo")');

// Remove renderPaymentDistribution call
code = code.replace('        renderPaymentDistribution();\n', '');

fs.writeFileSync(f, code, 'utf8');
console.log('Simple ID fixes done');
