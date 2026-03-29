const fs = require('fs');
const path = require('path');

const enginePath = path.join('src', 'main', 'matching-engine.js');
let code = fs.readFileSync(enginePath, 'utf8');
fs.writeFileSync(enginePath + '.bak6', code);

// ============================================
// FIX 1: scoreAmount - reflect actual ratio
// ============================================
// Find scoreAmount and make it return actual percentage, not 100% for close matches
const scoreAmountRegex = /function\s+scoreAmount\s*\([^)]*\)\s*\{[\s\S]*?^  \}/m;
const scoreAmountMatch = code.match(scoreAmountRegex);

if (!scoreAmountMatch) {
    // Alternative: find by line content
    const lines = code.split('\n');
    let startIdx = -1;
    let endIdx = -1;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/function\s+scoreAmount/) || lines[i].match(/scoreAmount\s*[:=]\s*function/)) {
            startIdx = i;
            braceCount = 0;
        }
        if (startIdx >= 0) {
            braceCount += (lines[i].match(/\{/g) || []).length;
            braceCount -= (lines[i].match(/\}/g) || []).length;
            if (braceCount === 0 && i > startIdx) {
                endIdx = i;
                break;
            }
        }
    }
    
    if (startIdx >= 0 && endIdx >= 0) {
        console.log(`Found scoreAmount at lines ${startIdx+1}-${endIdx+1}`);
        console.log('Current code:', lines.slice(startIdx, endIdx+1).join('\n').substring(0, 300));
    } else {
        console.log('WARN: scoreAmount function not found by line scan');
    }
}

// ============================================
// FIX 2: getMatchType - lower tolerance
// ============================================
// Change AMOUNT_EXACT_TOLERANCE from 2 to 0.5
const toleranceFix = code.replace(
    /(AMOUNT_EXACT_TOLERANCE\s*[:=]\s*)\d+(\.\d+)?/,
    '$1 0.5'
);
if (toleranceFix !== code) {
    code = toleranceFix;
    console.log('FIX 2: AMOUNT_EXACT_TOLERANCE changed to 0.5');
} else {
    console.log('WARN: AMOUNT_EXACT_TOLERANCE pattern not found');
}

// ============================================
// FIX 3: formatMatch - ensure shortage propagation
// ============================================
// In formatMatch, ensure amount_score reflects actual ratio
const lines = code.split('\n');
let modified = false;

for (let i = 0; i < lines.length; i++) {
    // Find: amount_score: breakdown.amount_score || 0,
    if (lines[i].includes('amount_score:') && lines[i].includes('breakdown.amount_score')) {
        // Keep as is - the real fix is in scoreAmount
        console.log(`Line ${i+1}: amount_score assignment found`);
    }
    
    // Find the confidence calculation and adjust for partial matches
    if (lines[i].includes('confidence:') && lines[i].includes('100') && lines[i].includes('m.confidence')) {
        console.log(`Line ${i+1}: confidence assignment: ${lines[i].trim()}`);
    }
}

// ============================================  
// FIX 4: Ensure partial payments reduce amount_score
// ============================================
// After the line that computes amount_score in matching layers,
// add: if match_type is partial, cap amount_score at actual ratio

// Search for where amount_score is computed in matching
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('amount_score') && lines[i].includes('scoreAmount')) {
        console.log(`Line ${i+1}: scoreAmount call: ${lines[i].trim()}`);
    }
}

fs.writeFileSync(enginePath, code, 'utf8');
console.log('\nPartial fixes applied. Need scoreAmount details to complete.');
console.log('Backup saved as .bak6');
