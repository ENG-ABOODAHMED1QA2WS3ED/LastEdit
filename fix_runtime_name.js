const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Add a fix in runMatching: before the loop, update any bank txns with empty parsed_name
// Find: "for (const bt of bankTxns) {"  in the matching loop (around line 217)
let inserted = false;
for (let i = 115; i < lines.length; i++) {
  if (lines[i].includes("let bankQuery =") && lines[i].includes("bank_transactions")) {
    // Add after the bankTxns query: fix empty parsed_name from raw_description
    const fixIdx = i + 2; // after const bankTxns = ...
    // Find the actual bankTxns line
    for (let j = i; j < i + 10; j++) {
      if (lines[j].includes('const bankTxns =')) {
        const patch = [
          '',
          '    // Fix: populate parsed_name from raw_description if empty',
          '    for (const bt of bankTxns) {',
          '      if (!bt.parsed_name && bt.raw_description) {',
          '        bt.parsed_name = this.extractSenderName(bt.raw_description);',
          '        if (!bt.parsed_name) bt.parsed_name = bt.raw_description;',
          '      }',
          '    }',
          ''
        ];
        lines.splice(j + 1, 0, ...patch);
        console.log('Patch inserted after line', j + 1);
        inserted = true;
        break;
      }
    }
    break;
  }
}

if (!inserted) console.log('WARNING: patch location not found!');

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Total lines:', fs.readFileSync(f, 'utf8').split('\n').length);
