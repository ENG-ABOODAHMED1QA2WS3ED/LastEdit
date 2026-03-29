const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let code = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.bak-syntax2', code);

let lines = code.split('\n');
let fixes = 0;

// === FIX 1: Line 733-734 ===
// groupedHtml +
// multiTransferHtml += '<div class="grouped-invoice-item">'
// SHOULD BE: groupedHtml += '<div class="grouped-invoice-item">'
for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === 'groupedHtml +' && 
        lines[i+1].includes('multiTransferHtml +=') && 
        lines[i+1].includes('grouped-invoice-item')) {
        const content = lines[i+1].replace('multiTransferHtml +=', '').trim();
        lines[i] = lines[i].replace('groupedHtml +', 'groupedHtml += ' + content);
        lines.splice(i+1, 1);
        fixes++;
        console.log('FIX 1: Line ' + (i+1) + ' - fixed groupedHtml/multiTransferHtml broken assignment');
        break;
    }
}

// === FIX 2: Line 516 ===
// itemsHtml +
// '<div class="grouped-total">...'
// SHOULD BE: itemsHtml += '<div class="grouped-total">...'
for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === 'itemsHtml +' && 
        lines[i+1].includes('grouped-total')) {
        const indent = lines[i].match(/^\s*/)[0];
        lines[i] = indent + 'itemsHtml +=';
        fixes++;
        console.log('FIX 2: Line ' + (i+1) + ' - fixed itemsHtml broken assignment');
        break;
    }
}

// === GENERAL FIX: Find any remaining "varHtml +" without "=" patterns ===
for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Pattern: ends with "Html +" and next line has "+=" 
    if (/^\w+Html \+$/.test(trimmed)) {
        // Check if next line has the actual += assignment to a DIFFERENT variable
        if (i + 1 < lines.length && lines[i+1].includes('+=')) {
            const varName = trimmed.replace(' +', '');
            const nextContent = lines[i+1].replace(/\w+Html \+=/, '').trim();
            const indent = lines[i].match(/^\s*/)[0];
            lines[i] = indent + varName + ' += ' + nextContent;
            lines.splice(i+1, 1);
            fixes++;
            console.log('GENERAL FIX: Line ' + (i+1) + ' - fixed ' + varName + ' broken assignment');
        }
    }
}

code = lines.join('\n');
fs.writeFileSync(filePath, code, 'utf8');

console.log('\nTotal fixes applied:', fixes);

// Verify - search for remaining broken patterns
const finalLines = code.split('\n');
let remaining = 0;
for (let i = 0; i < finalLines.length; i++) {
    if (/^\s*\w+Html \+\s*$/.test(finalLines[i])) {
        // Check if it's part of a string concatenation (next line starts with string)
        if (i + 1 < finalLines.length) {
            const next = finalLines[i+1].trim();
            // If next line starts with a variable assignment, it's broken
            if (next.includes('+=')) {
                console.log('REMAINING ISSUE at line ' + (i+1) + ': ' + finalLines[i].trim());
                remaining++;
            }
        }
    }
}
console.log('Remaining broken patterns:', remaining);

// Show the card template concatenation area (around line 796)
console.log('\n=== CARD TEMPLATE AREA ===');
for (let i = 0; i < finalLines.length; i++) {
    if (finalLines[i].includes('groupedHtml') && finalLines[i].includes('partialHtml')) {
        const start = Math.max(0, i - 3);
        const end = Math.min(finalLines.length - 1, i + 5);
        for (let j = start; j <= end; j++) {
            console.log((j+1) + ': ' + finalLines[j]);
        }
        break;
    }
}
