const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Fix 1: extractSenderName - add fallback at line 47 (return '')
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === "return '';" && i > 25 && i < 50) {
    lines[i] = [
      "    // Fallback: desc itself is the name (pre-parsed from BOP CSV)",
      "    let fallback = desc.trim();",
      "    fallback = fallback.replace(/^(تحويل الكتروني موبايل:|الدفع لصديق|الدفع للاخرين|e-payment|payment)/i, '').trim();",
      "    fallback = fallback.replace(/\\s*-\\s*WALLET.*/i, '');",
      "    fallback = fallback.replace(/\\s*\\/\\s*\\d+/g, '');",
      "    fallback = fallback.replace(/\\s+/g, ' ').trim();",
      "    if (fallback.length >= 2 && !/^[\\d.]+$/.test(fallback)) return fallback;",
      "    return '';"
    ].join('\n');
    console.log('Fix 1 applied at line', i + 1);
    break;
  }
}

// Fix 2: runMatching - use raw_description as fallback for bankName
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("const bankName = bt.parsed_name || '';")) {
    lines[i] = "        const bankName = bt.parsed_name || bt.raw_description || '';";
    console.log('Fix 2 applied at line', i + 1);
    break;
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Total lines:', fs.readFileSync(f, 'utf8').split('\n').length);

// Verify
const code = fs.readFileSync(f, 'utf8');
console.log('Has fallback:', code.includes('Fallback: desc itself'));
console.log('Has raw_description fallback:', code.includes('bt.raw_description'));
