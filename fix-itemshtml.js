const fs = require('fs');
const filePath = 'src/renderer/scripts/matching.js';
let code = fs.readFileSync(filePath, 'utf8');
fs.writeFileSync(filePath + '.bak-syntax3', code);

// The problem: line 516 has "itemsHtml +=" which breaks the html += concatenation chain
// It should be: itemsHtml + (just a reference to the variable, not an assignment)
// The html += chain from line 503 goes through line 524

// Fix: "itemsHtml +=" should be "itemsHtml +"
// This is inside the html += '...' + itemsHtml + '...' chain

const lines = code.split('\n');
let fixes = 0;

for (let i = 0; i < lines.length; i++) {
    // Find the broken pattern: itemsHtml += followed by grouped-total
    if (lines[i].trim() === 'itemsHtml +=' && 
        i + 1 < lines.length && lines[i+1].includes('grouped-total')) {
        const indent = lines[i].match(/^\s*/)[0];
        lines[i] = indent + 'itemsHtml +';
        fixes++;
        console.log('FIX: Line ' + (i+1) + ' - changed "itemsHtml +=" back to "itemsHtml +"');
    }
}

code = lines.join('\n');
fs.writeFileSync(filePath, code, 'utf8');
console.log('Total fixes:', fixes);

// Verify the fixed area
const final = code.split('\n');
console.log('\n=== LINES 513-520 AFTER FIX ===');
for (let i = 512; i < 520 && i < final.length; i++) {
    console.log((i+1) + ': ' + final[i]);
}

// Also verify no more broken patterns exist
console.log('\n=== FULL SYNTAX CHECK ===');
let issues = 0;
for (let i = 0; i < final.length; i++) {
    const t = final[i].trim();
    // Check for standalone "varName +=" that breaks a concatenation chain
    if (/^\w+Html \+=$/.test(t)) {
        console.log('POTENTIAL ISSUE at ' + (i+1) + ': ' + t);
        issues++;
    }
}
console.log('Potential issues found:', issues);
