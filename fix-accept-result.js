const fs = require('fs');
const enginePath = 'src/main/matching-engine.js';
let engine = fs.readFileSync(enginePath, 'utf8');
fs.writeFileSync(enginePath + '.bak5', engine, 'utf8');

// FIX: _acceptResult - disable auto-confirm completely
const oldAcceptResult = `  _acceptResult(result, autoConfirmed, suggested, usedPaymentIds, usedBankIds) {
    if (result.confidence >= CONFIG.AUTO_CONFIRM_THRESHOLD) {
      this._doAutoConfirm(result);
      autoConfirmed.push(formatMatch(result));
    } else {
      suggested.push(formatMatch(result));
    }
    usedPaymentIds.add(result.payment.id);
    usedBankIds.add(result.bankTxn.id);
  }`;

const newAcceptResult = `  _acceptResult(result, autoConfirmed, suggested, usedPaymentIds, usedBankIds) {
    // === AUTO-CONFIRM DISABLED (safety mode) ===
    // ALL matches go to suggestions - no auto-confirm at any layer
    suggested.push(formatMatch(result));
    usedPaymentIds.add(result.payment.id);
    usedBankIds.add(result.bankTxn.id);
  }`;

if (engine.includes(oldAcceptResult)) {
  engine = engine.replace(oldAcceptResult, newAcceptResult);
  fs.writeFileSync(enginePath, engine, 'utf8');
  console.log('SUCCESS: _acceptResult auto-confirm COMPLETELY disabled');
  console.log('Layer 0 (reference match) -> now goes to suggestions');
  console.log('Layer 1 (learning cache) -> now goes to suggestions');
  console.log('Layer 2 (smart scoring) -> was already disabled');
} else {
  console.log('ERROR: _acceptResult not found exactly');
  const idx = engine.indexOf('_acceptResult');
  if (idx > -1) console.log('Found at:', idx, engine.substring(idx, idx + 200));
}
