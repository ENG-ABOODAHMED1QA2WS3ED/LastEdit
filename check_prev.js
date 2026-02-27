const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
let code = fs.readFileSync(f, 'utf8');

// Check if loadPreviousClosing exists
const hasFunc = code.includes('async function loadPreviousClosing()');
const hasCall = code.includes('await loadPreviousClosing()');
console.log('Function exists:', hasFunc);
console.log('Call exists:', hasCall);

// Show the error line area
const lines = code.split('\n');
for (let i = 70; i < 85; i++) {
    console.log((i+1) + ': ' + lines[i]);
}
