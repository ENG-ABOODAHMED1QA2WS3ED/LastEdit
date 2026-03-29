const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  FINAL FIX: Amount Score + Partial Pay');
console.log('========================================\n');

let fixCount = 0;

// ============================================
// FILE 1: matching-config.js
// ============================================
const configPath = path.join('src', 'config', 'matching-config.js');
let config = fs.readFileSync(configPath, 'utf8');
fs.writeFileSync(configPath + '.bak-final', config);

// FIX 1: AMOUNT_EXACT_TOLERANCE 2 → 0.5 (only bank commission, NOT real shortage)
const oldTolerance = config;
config = config.replace(
    /AMOUNT_EXACT_TOLERANCE:\s*2\b/,
    'AMOUNT_EXACT_TOLERANCE: 0.5'
);
if (config !== oldTolerance) {
    console.log('✅ FIX 1: AMOUNT_EXACT_TOLERANCE: 2 → 0.5');
    fixCount++;
} else {
    console.log('❌ FIX 1: AMOUNT_EXACT_TOLERANCE not found');
}

// FIX 2: PARTIAL_SAFE_PCT 20 → 5 (only tiny shortages are "safe")
const oldSafe = config;
config = config.replace(
    /PARTIAL_SAFE_PCT:\s*20\b/,
    'PARTIAL_SAFE_PCT: 5'
);
if (config !== oldSafe) {
    console.log('✅ FIX 2: PARTIAL_SAFE_PCT: 20 → 5 (10% shortage = warning now)');
    fixCount++;
} else {
    console.log('❌ FIX 2: PARTIAL_SAFE_PCT not found');
}

fs.writeFileSync(configPath, config, 'utf8');

// ============================================
// FILE 2: matching-engine.js - scoreAmount
// ============================================
const enginePath = path.join('src', 'main', 'matching-engine.js');
let engine = fs.readFileSync(enginePath, 'utf8');
fs.writeFileSync(enginePath + '.bak-final', engine);

// FIX 3: Replace scoreAmount to reflect actual ratio
const oldScoreAmount = `function scoreAmount(txAmount, invoiceAmount) {
  if (!txAmount || !invoiceAmount || invoiceAmount === 0) return 30;
  const diff = Math.abs(txAmount - invoiceAmount);

  // Within bank commission tolerance = perfect match
  if (diff <= CONFIG.AMOUNT_EXACT_TOLERANCE) return 100;

  const ratio = txAmount / invoiceAmount;
  if (ratio >= 0.90 && ratio <= 1.10) return 85;
  if (ratio >= 0.80 && ratio <= 1.20) return 70;
  if (ratio >= 0.50 && ratio <= 1.50) return 45;
  if (ratio >= 0.20 && ratio <= 2.00) return 25;
  return 0;
}`;

const newScoreAmount = `function scoreAmount(txAmount, invoiceAmount) {
  if (!txAmount || !invoiceAmount || invoiceAmount === 0) return 30;
  const diff = Math.abs(txAmount - invoiceAmount);

  // Within bank commission tolerance (0.5 ILS) = perfect match
  if (diff <= CONFIG.AMOUNT_EXACT_TOLERANCE) return 100;

  // Calculate actual ratio and return proportional score
  const ratio = Math.min(txAmount, invoiceAmount) / Math.max(txAmount, invoiceAmount);
  // ratio = 18/20 = 0.90 → score = 90
  // ratio = 15/20 = 0.75 → score = 75
  // ratio = 10/20 = 0.50 → score = 50
  
  if (ratio >= 0.90) return Math.round(ratio * 100);      // 90-99 → actual %
  if (ratio >= 0.80) return Math.round(ratio * 100 * 0.9); // 80-89 → slight penalty
  if (ratio >= 0.50) return Math.round(ratio * 100 * 0.8); // 50-79 → moderate penalty
  if (ratio >= 0.20) return Math.round(ratio * 100 * 0.6); // 20-49 → heavy penalty
  return 0;
}`;

const oldEngine = engine;
engine = engine.replace(oldScoreAmount, newScoreAmount);
if (engine !== oldEngine) {
    console.log('✅ FIX 3: scoreAmount now returns actual ratio (18/20 = 90, not 100)');
    fixCount++;
} else {
    console.log('⚠️ FIX 3: Exact scoreAmount match failed, trying line-by-line...');
    
    // Try matching just the key line
    const lines = engine.split('\n');
    let fixed = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('function scoreAmount')) {
            // Find the end of the function
            let braceCount = 0;
            let funcStart = i;
            let funcEnd = -1;
            for (let j = i; j < lines.length; j++) {
                braceCount += (lines[j].match(/\{/g) || []).length;
                braceCount -= (lines[j].match(/\}/g) || []).length;
                if (braceCount === 0 && j > i) {
                    funcEnd = j;
                    break;
                }
            }
            if (funcEnd > 0) {
                const newFunc = newScoreAmount.split('\n');
                lines.splice(funcStart, funcEnd - funcStart + 1, ...newFunc);
                engine = lines.join('\n');
                console.log('✅ FIX 3 (alt): scoreAmount replaced at lines ' + (funcStart+1) + '-' + (funcEnd+1));
                fixCount++;
                fixed = true;
            }
            break;
        }
    }
    if (!fixed) console.log('❌ FIX 3: Could not replace scoreAmount');
}

// FIX 4: Fix shortage detection (line 1361) - don't override to 'full' when there IS a shortage
const oldShortageBlock = `      if (amountDiff <= CONFIG.AMOUNT_EXACT_TOLERANCE) {
        matchType = 'full';
      } else if (bankAmount < paymentAmount) {`;

const newShortageBlock = `      // FIX: Only 'full' if truly within commission tolerance (0.5 ILS)
      // AND bank amount >= invoice amount (no real shortage)
      if (amountDiff <= CONFIG.AMOUNT_EXACT_TOLERANCE && bankAmount >= paymentAmount - CONFIG.AMOUNT_EXACT_TOLERANCE) {
        matchType = 'full';
      } else if (bankAmount < paymentAmount) {`;

const oldEngine2 = engine;
engine = engine.replace(oldShortageBlock, newShortageBlock);
if (engine !== oldEngine2) {
    console.log('✅ FIX 4: Shortage detection now correctly identifies partial payments');
    fixCount++;
} else {
    console.log('⚠️ FIX 4: Trying flexible match...');
    // Try with any whitespace
    const flexOld = /if\s*\(amountDiff\s*<=\s*CONFIG\.AMOUNT_EXACT_TOLERANCE\)\s*\{\s*\n\s*matchType\s*=\s*'full';/;
    if (flexOld.test(engine)) {
        engine = engine.replace(flexOld, 
            `// FIX: Only 'full' if no real shortage\n      if (amountDiff <= CONFIG.AMOUNT_EXACT_TOLERANCE && bankAmount >= paymentAmount - CONFIG.AMOUNT_EXACT_TOLERANCE) {\n        matchType = 'full';`);
        console.log('✅ FIX 4 (flex): Shortage detection fixed');
        fixCount++;
    } else {
        console.log('❌ FIX 4: Could not fix shortage detection');
    }
}

fs.writeFileSync(enginePath, engine, 'utf8');

// ============================================
// FILE 3: matching.js - UI card (warning badge color)
// ============================================
const matchingUIPath = path.join('src', 'renderer', 'scripts', 'matching.js');
let matchingUI = fs.readFileSync(matchingUIPath, 'utf8');
fs.writeFileSync(matchingUIPath + '.bak-final', matchingUI);

// FIX 5: Warning badge should be orange/red, not green
// Find the security badge rendering
const oldUI = matchingUI;
// Fix warning badge color - search for where security badges are rendered
matchingUI = matchingUI.replace(
    /class="badge badge-([^"]*)">\s*(تحذير|warning)/g,
    'class="badge badge-warning-orange">تحذير'
);
if (matchingUI !== oldUI) {
    console.log('✅ FIX 5: Warning badge color fixed to orange');
    fixCount++;
}

// FIX 6: Also fix where security_level determines badge class
const oldUI2 = matchingUI;
matchingUI = matchingUI.replace(
    /(['"])safe\1\s*:\s*(['"])([^'"]*badge-success[^'"]*)\2/g,
    "'safe': 'badge-success'"
);

// Search for the securityBadge or security level mapping
const uiLines = matchingUI.split('\n');
for (let i = 0; i < uiLines.length; i++) {
    // Fix: if security badge maps 'warning' to green class
    if (uiLines[i].includes('security') && uiLines[i].includes('badge') && uiLines[i].includes('warning')) {
        const oldLine = uiLines[i];
        uiLines[i] = uiLines[i]
            .replace(/badge-success/g, 'badge-warning')
            .replace(/badge-info/g, 'badge-warning');
        if (uiLines[i] !== oldLine) {
            console.log(`✅ FIX 6: Line ${i+1} badge class fixed for warning`);
            fixCount++;
        }
    }
}
matchingUI = uiLines.join('\n');

fs.writeFileSync(matchingUIPath, matchingUI, 'utf8');

// ============================================
// FILE 4: matching.css - Add warning-orange style
// ============================================
const cssPath = path.join('src', 'renderer', 'styles', 'matching.css');
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('badge-warning-orange')) {
    css += `

/* === Warning badge - orange color (not green!) === */
.badge-warning-orange {
    background: #ff9800 !important;
    color: #fff !important;
    font-weight: bold;
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 0.85em;
}

.badge-warning {
    background: #ff9800 !important;
    color: #fff !important;
}
`;
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log('✅ FIX 7: CSS warning-orange badge style added');
    fixCount++;
}

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log('  SUMMARY: ' + fixCount + ' fixes applied');
console.log('========================================');
console.log('');
console.log('Changes made:');
console.log('  1. AMOUNT_EXACT_TOLERANCE: 2 → 0.5 (only bank commission)');
console.log('  2. PARTIAL_SAFE_PCT: 20 → 5 (10% shortage = warning)');
console.log('  3. scoreAmount: returns actual ratio (18/20 = 90%)');
console.log('  4. Shortage detection: 18 < 20 always = partial');
console.log('  5-7. UI: warning badge = orange (not green)');
console.log('');
console.log('Expected result for Samir:');
console.log('  - amount_score: 90 (was 100)');
console.log('  - match_type: partial (was sometimes full)');
console.log('  - security_level: warning (was safe)');
console.log('  - confidence: ~91 (was 97)');
console.log('  - badge color: ORANGE (was green)');
console.log('');
console.log('Backups: *.bak-final');
console.log('Run: npm start');
