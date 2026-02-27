const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\matching.js';
const lines = fs.readFileSync(f, 'utf8').split('\n');

// Check brace balance in handleFileUpload
let start = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async function handleFileUpload')) { start = i; break; }
}

let braces = 0;
let end = -1;
for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
        if (ch === '{') braces++;
        if (ch === '}') braces--;
    }
    if (braces === 0 && i > start) { end = i; break; }
}

console.log('handleFileUpload: lines', start+1, 'to', end+1);
console.log('Brace balance:', braces);

// Show key transition area
console.log('\n=== Standard end + unified summary ===');
for (let i = 225; i < 250; i++) {
    console.log((i+1) + ': ' + (lines[i] || ''));
}
