const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\matching.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Remove duplicate line 209 (index 208)
if (lines[208] && lines[208].includes('if (colDesc === -1 || colReceived === -1)') && 
    lines[209] && lines[209].includes('if (colDesc === -1 || colReceived === -1)')) {
    lines.splice(208, 1);
    console.log('Removed duplicate colDesc check');
}

// Now find where standard parsing ends and add closing brace
// Find "} // end standard format" - if not exists, add it
let hasClosing = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('end standard format')) { hasClosing = true; break; }
}

if (!hasClosing) {
    // Find the showImportSummary line
    let summaryIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('showImportSummary')) { summaryIdx = i; break; }
    }
    
    // Find parsedEntries after summary
    let parsedEnd = -1;
    for (let i = summaryIdx; i < lines.length; i++) {
        if (lines[i].includes('.filter(e => e.amount > 0)')) { parsedEnd = i + 1; break; }
    }
    
    if (summaryIdx !== -1 && parsedEnd !== -1) {
        // Replace old summary + parsedEntries with closing brace and unified code
        const newCode = [
            '    } // end standard format',
            '',
            '    // عرض ملخص الاستيراد',
            '    showImportSummary(parsedEntries.length + skipped, incoming, outgoing, skipped);',
            '',
            '    console.log("عمليات واردة محللة:", parsedEntries.length);',
            '    parsedEntries.forEach(e => console.log("  ", (e.description || "").substring(0,60), "|", e.amount));',
        ];
        lines.splice(summaryIdx, parsedEnd - summaryIdx, ...newCode);
        console.log('Added closing brace and unified summary');
    }
}

// Fix: the standard format section needs parsedEntries building
// Find the section between colDesc check and showImportSummary
let stdStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const dataLines = allLines.slice(headerIndex + 1)')) { stdStart = i; break; }
}

let stdEnd = -1;
for (let i = stdStart || 0; i < lines.length; i++) {
    if (lines[i].includes('end standard format')) { stdEnd = i; break; }
}

if (stdStart !== -1 && stdEnd !== -1) {
    // Replace with corrected standard parsing that builds parsedEntries
    const stdCode = [
        '      const dataLines = allLines.slice(headerIndex + 1);',
        '',
        '      for (const line of dataLines) {',
        '        if (!line || line.startsWith(",,,")) continue;',
        '        const cols = parseCSVLine(line);',
        '        if (cols.length < 3) { skipped++; continue; }',
        '',
        '        const desc = (cols[colDesc] || "").trim();',
        '        const receivedStr = (cols[colReceived] || "").replace(/,/g, "").trim();',
        '        const paidStr = colPaid >= 0 ? (cols[colPaid] || "").replace(/,/g, "").trim() : "";',
        '        const dateStr = colDate >= 0 ? (cols[colDate] || "").trim() : "";',
        '        const received = parseFloat(receivedStr);',
        '        const paid = parseFloat(paidStr);',
        '',
        '        if (received > 0) {',
        '          incoming++;',
        '          parsedEntries.push({ date: dateStr, description: desc, amount: received, rawRow: cols });',
        '        } else if (paid && (paid < 0 || paidStr.startsWith("-"))) {',
        '          outgoing++;',
        '        } else {',
        '          skipped++;',
        '        }',
        '      }',
    ];
    lines.splice(stdStart, stdEnd - stdStart, ...stdCode);
    console.log('Fixed standard parsing section');
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Total lines:', lines.length);
