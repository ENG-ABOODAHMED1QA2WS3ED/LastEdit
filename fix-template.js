const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let code = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.bak-template', code);

let fixes = 0;

// FIX: Add custInvoicesHtml and multiTransferHtml to card template
// Current:  groupedHtml +\n    partialHtml +
// Target:   custInvoicesHtml +\n    multiTransferHtml +\n    groupedHtml +\n    partialHtml +

const oldPattern = '    groupedHtml +\n    partialHtml +\n    warningsHtml +\n    altHtml +';
const newPattern = '    custInvoicesHtml +\n    multiTransferHtml +\n    groupedHtml +\n    partialHtml +\n    warningsHtml +\n    altHtml +';

if (code.includes(oldPattern)) {
    code = code.replace(oldPattern, newPattern);
    fixes++;
    console.log('FIX 1: Added custInvoicesHtml + multiTransferHtml to card template');
} else {
    // Try with different spacing
    const patterns = [
        'groupedHtml +\n    partialHtml +',
        'groupedHtml +\r\n    partialHtml +',
        'groupedHtml +\n      partialHtml +',
    ];
    let found = false;
    for (const p of patterns) {
        if (code.includes(p)) {
            code = code.replace(p, 'custInvoicesHtml +\n    multiTransferHtml +\n    ' + p);
            fixes++;
            found = true;
            console.log('FIX 1 (alt): Added custInvoicesHtml + multiTransferHtml before groupedHtml');
            break;
        }
    }
    if (!found) {
        console.log('WARNING: Could not find card template pattern. Searching...');
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === 'groupedHtml +' && 
                i + 1 < lines.length && lines[i+1].trim() === 'partialHtml +') {
                const indent = lines[i].match(/^\s*/)[0];
                lines.splice(i, 0, indent + 'custInvoicesHtml +');
                lines.splice(i + 1, 0, indent + 'multiTransferHtml +');
                code = lines.join('\n');
                fixes++;
                console.log('FIX 1 (line-by-line): Inserted at line ' + (i+1));
                break;
            }
        }
    }
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nTotal fixes:', fixes);

// Verify the card template area
const finalLines = code.split('\n');
for (let i = 0; i < finalLines.length; i++) {
    if (finalLines[i].includes('groupedHtml') && finalLines[i].includes('+')) {
        const start = Math.max(0, i - 4);
        const end = Math.min(finalLines.length - 1, i + 6);
        console.log('\n=== CARD TEMPLATE (verified) ===');
        for (let j = start; j <= end; j++) {
            console.log((j+1) + ': ' + finalLines[j]);
        }
        break;
    }
}
