const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let code = fs.readFileSync(f, 'utf8');

// Check current value
const match60 = code.includes("suggestion_threshold: '60'");
const match45 = code.includes("suggestion_threshold: '45'");
console.log('Has 60:', match60, '| Has 45:', match45);

// Replace
code = code.replace(/suggestion_threshold:\s*'60'/, "suggestion_threshold: '45'");
code = code.replace(/suggestion_threshold:\s*'55'/, "suggestion_threshold: '45'");

// Also lower minSim from 0.6 to 0.4 to catch more partial matches
code = code.replace(/min_name_similarity:\s*'0\.6'/, "min_name_similarity: '0.5'");

fs.writeFileSync(f, code, 'utf8');

// Verify
const v = fs.readFileSync(f, 'utf8');
const line = v.split('\n').find(l => l.includes('suggestion_threshold'));
console.log('Config line:', line ? line.trim() : 'NOT FOUND');
console.log('Done!');
