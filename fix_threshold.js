const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let code = fs.readFileSync(f, 'utf8');

// Fix 1: Lower suggestion threshold from 60 to 45
code = code.replace(
  "suggestion_threshold: '60'",
  "suggestion_threshold: '45'"
);

// Fix 2: Add score logging so we can see what score each match gets
code = code.replace(
  'const score = this.calcScore(amountDiff, matchedAmount, bestSim);',
  'const score = this.calcScore(amountDiff, matchedAmount, bestSim); console.log("  SCORE:", score, "| amountDiff:", amountDiff, "| nameSim:", bestSim.toFixed(2));'
);

fs.writeFileSync(f, code, 'utf8');

// Verify
const updated = fs.readFileSync(f, 'utf8');
console.log('Threshold:', updated.includes("suggestion_threshold: '45'") ? '45 OK' : 'FAILED');
console.log('Score log:', updated.includes('SCORE:') ? 'OK' : 'FAILED');
console.log('Total lines:', updated.split('\\n').length);
