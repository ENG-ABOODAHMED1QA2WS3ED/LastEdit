const fs = require('fs');
const filePath = 'src/main/matching-engine.js';
let code = fs.readFileSync(filePath, 'utf8');

// Check current import
const importLine = code.split('\n').find(l => l.includes('bank-statement-parser'));
console.log('Current import:', importLine);

// The parser exports: module.exports = BankStatementParser (direct export)
// The engine imports: const { BankStatementParser } = require(...) (destructured)
// Fix: remove the destructuring braces

const oldImport = "const { BankStatementParser }      = require('./parsers/bank-statement-parser');";
const newImport = "const BankStatementParser           = require('./parsers/bank-statement-parser');";

if (code.includes(oldImport)) {
    code = code.replace(oldImport, newImport);
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('FIX: Removed destructuring braces from BankStatementParser import');
} else {
    // Try flexible match
    const regex = /const\s*\{\s*BankStatementParser\s*\}\s*=\s*require\(['"]\.\/parsers\/bank-statement-parser['"]\)/;
    if (regex.test(code)) {
        code = code.replace(regex, "const BankStatementParser = require('./parsers/bank-statement-parser')");
        fs.writeFileSync(filePath, code, 'utf8');
        console.log('FIX (regex): Removed destructuring braces');
    } else {
        console.log('WARNING: Could not find import to fix');
        console.log('Looking for any BankStatementParser require...');
        code.split('\n').forEach((l, i) => {
            if (l.includes('bank-statement-parser')) console.log((i+1) + ': ' + l);
        });
    }
}

// Verify
const finalCode = fs.readFileSync(filePath, 'utf8');
const newLine = finalCode.split('\n').find(l => l.includes('bank-statement-parser'));
console.log('After fix:', newLine);

// Quick test - try to require the parser ourselves
try {
    const BSP = require('./src/main/parsers/bank-statement-parser');
    console.log('\nParser test:');
    console.log('  Type:', typeof BSP);
    console.log('  Is class:', typeof BSP === 'function');
    console.log('  Has parsePalestine:', typeof BSP.parsePalestineBankStatement);
    
    const { BankStatementParser: BSP2 } = { BankStatementParser: BSP };
    console.log('  Destructured test:', typeof BSP2?.parsePalestineBankStatement);
} catch(e) {
    console.log('Could not test parser directly:', e.message);
}
