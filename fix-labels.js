const fs = require('fs');
const path = require('path');

const filePath = path.join('src', 'renderer', 'scripts', 'matching.js');
let code = fs.readFileSync(filePath, 'utf8');

// FIX 1: Add multi_transfer to typeLabels (line 608)
const oldLabels = "const typeLabels = { full: '\u0643\u0627\u0645\u0644\u0629', partial: '\u062C\u0632\u0626\u064A\u0629', over: '\u0632\u064A\u0627\u062F\u0629', grouped_complementary: '\u0645\u062C\u0645\u0639\u0629' };";
const newLabels = "const typeLabels = { full: '\u0643\u0627\u0645\u0644\u0629', partial: '\u062C\u0632\u0626\u064A\u0629', over: '\u0632\u064A\u0627\u062F\u0629', grouped_complementary: '\u0645\u062C\u0645\u0639\u0629', multi_transfer: '\u062A\u062D\u0648\u064A\u0644\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629' };";

code = code.replace(oldLabels, newLabels);
console.log('FIX 1: typeLabels updated');

// FIX 2: Fix security badge for warning - ensure it shows orange
// Find the security level mapping
const oldSec = code;
code = code.replace(
    /warning['"]\s*:\s*['"]badge-success/g,
    "warning': 'badge-warning"
);
if (code !== oldSec) console.log('FIX 2: warning badge class fixed');

// FIX 3: Also update the secText/secClass mapping for multi_transfer
// Find where security badges are determined
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('securityLevel') || lines[i].includes('security_level')) {
        if (lines[i].includes('badge') || lines[i].includes('secClass') || lines[i].includes('secText')) {
            console.log(`Line ${i+1}: ${lines[i].trim()}`);
        }
    }
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nDone! Run: npm start');
