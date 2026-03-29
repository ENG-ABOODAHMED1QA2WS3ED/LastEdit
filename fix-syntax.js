const fs = require('fs');
const path = require('path');

const filePath = path.join('src', 'renderer', 'scripts', 'matching.js');
let code = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.bak-syntax', code);

// Fix the broken lines 669-670
code = code.replace(
    "multiTransferHtml +\n      custInvoicesHtml += '<div class=\"multi-transfer-item\">'",
    "multiTransferHtml += '<div class=\"multi-transfer-item\">'"
);

// Verify fix
if (code.includes('multiTransferHtml +\n      custInvoicesHtml +=')) {
    console.log('ERROR: First fix did not work');
} else {
    console.log('FIX 1: Broken assignment fixed');
}

// Double check - search for any remaining broken patterns
const lines = code.split('\n');
let errors = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('multiTransferHtml +') && 
        i + 1 < lines.length && 
        lines[i+1].includes('custInvoicesHtml +=')) {
        console.log('FOUND broken pattern at line', i+1, ':', lines[i].trim());
        // Fix it
        lines[i] = lines[i].replace('multiTransferHtml +', 'multiTransferHtml +=');
        lines[i+1] = lines[i+1].replace('custInvoicesHtml +=', '');
        errors++;
    }
}

if (errors > 0) {
    code = lines.join('\n');
    console.log('Fixed', errors, 'additional broken patterns');
}

fs.writeFileSync(filePath, code, 'utf8');

// Verify the fix around line 669
const newLines = code.split('\n');
console.log('\n=== LINES 668-673 AFTER FIX ===');
for (let i = 667; i <= 672 && i < newLines.length; i++) {
    console.log((i+1) + ': ' + newLines[i]);
}

console.log('\nDone! Run: npm start');
