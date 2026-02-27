const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\matching.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Remove duplicate lines 247-248 (index 246-247)
if (lines[246] && lines[246].includes('عمليات واردة محللة') && 
    lines[243] && lines[243].includes('عمليات واردة محللة')) {
    lines.splice(246, 2);
    console.log('Removed duplicate log lines');
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Total:', lines.length);
