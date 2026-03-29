const fs = require('fs');
const f = 'src/main/matching-engine.js';
let code = fs.readFileSync(f, 'utf8');
let fixes = 0;

// Add debug log EVERY time a payment is consumed (lines 886,890,902,906,939)
// Replace usedPaymentIds.add(layer0.payment.id) with logged version
const oldL0add = 'usedPaymentIds.add(layer0.payment.id);';
const newL0add = 'usedPaymentIds.add(layer0.payment.id); console.log("[CONSUMED] Layer0: bank#" + bankTxn.id + " amt=" + bankTxn.amount + " => pay#" + layer0.payment.id + " payAmt=" + (layer0.payment.total_amount||layer0.payment.amount) + " conf=" + layer0.confidence);';
while (code.includes(oldL0add)) { code = code.replace(oldL0add, newL0add); fixes++; }

const oldL1add = 'usedPaymentIds.add(layer1.payment.id);';
const newL1add = 'usedPaymentIds.add(layer1.payment.id); console.log("[CONSUMED] Layer1: bank#" + bankTxn.id + " amt=" + bankTxn.amount + " => pay#" + layer1.payment.id + " payAmt=" + (layer1.payment.total_amount||layer1.payment.amount) + " conf=" + layer1.confidence);';
while (code.includes(oldL1add)) { code = code.replace(oldL1add, newL1add); fixes++; }

const oldL2add = 'usedPaymentIds.add(best.payment.id);';
const newL2add = 'usedPaymentIds.add(best.payment.id); console.log("[CONSUMED] Layer2: bank#" + bankTxn.id + " amt=" + bankTxn.amount + " => pay#" + best.payment.id + " payAmt=" + (best.payment.total_amount||best.payment.amount) + " conf=" + best.confidence);';
code = code.replace(oldL2add, newL2add); if(code.includes('[CONSUMED] Layer2')) fixes++;

fs.writeFileSync(f, code, 'utf8');
console.log("Fixes applied: " + fixes);
