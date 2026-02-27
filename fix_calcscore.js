const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Find calcScore function
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('calcScore(')) start = i;
    if (start !== -1 && i > start && lines[i].trim() === '}') { end = i; break; }
}

if (start !== -1 && end !== -1) {
    const newFunc = [
        '  calcScore(amountDiff, expectedAmount, nameSim) {',
        '    let score = 0;',
        '    // نقاط المبلغ - تدريجية حسب القرب',
        '    if (amountDiff === 0) score += 40;',
        '    else if (amountDiff <= 2) score += 36;',
        '    else if (amountDiff <= 5) score += 30;',
        '    else if (amountDiff <= 10) score += 25;',
        '    else if (amountDiff <= 20) score += 20;',
        '    else if (amountDiff <= 50) score += 15;',
        '    else if (amountDiff <= 100) score += 10;',
        '    else score += Math.max(2, 10 - Math.floor(amountDiff / 50));',
        '    score += Math.min(30, nameSim * 30);',
        '    score += 10; // date base',
        '    score += 5;  // ref base',
        '    return Math.round(score);',
        '  }'
    ];
    lines.splice(start, end - start + 1, ...newFunc);
    fs.writeFileSync(f, lines.join('\n'), 'utf8');
    console.log('calcScore updated! Lines:', start + 1, 'to', start + newFunc.length);
    console.log('Total:', lines.length);
} else {
    console.log('ERROR: calcScore not found', start, end);
}
