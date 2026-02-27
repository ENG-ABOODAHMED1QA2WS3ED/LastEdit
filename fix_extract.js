const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let code = fs.readFileSync(f, 'utf8');

// Fix extractSenderName: if no pattern matches, return the whole description as name
const oldReturn = "    return '';";
const newReturn =     // No pattern matched - description itself is likely the name (pre-parsed from CSV)
    let fallback = desc.trim();
    // Remove common prefixes/suffixes
    fallback = fallback.replace(/^(تحويل الكتروني موبايل:|الدفع لصديق|الدفع للاخرين|e-payment|payment)/i, '').trim();
    fallback = fallback.replace(/\\s*-\\s*WALLET.*/i, '');
    fallback = fallback.replace(/\\s*\\/\\s*\\d+/g, '');
    fallback = fallback.replace(/\\s*\\/\\s*$/g, '');
    fallback = fallback.replace(/\\s+/g, ' ').trim();
    // If what remains looks like a name (2+ chars, not just numbers), return it
    if (fallback.length >= 2 && !/^[\\d\\.]+$/.test(fallback)) {
      return fallback;
    }
    return '';;

if (code.includes("    return '';\\n  }\\n\\n  detectTransferType")) {
  code = code.replace("    return '';\\n  }\\n\\n  detectTransferType", newReturn + "\\n  }\\n\\n  detectTransferType");
} else {
  // Find the exact location: line 47 "return '';" inside extractSenderName
  const lines = code.split('\\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "return '';" && i > 25 && i < 50) {
      lines[i] = newReturn;
      console.log('Fixed at line', i + 1);
      break;
    }
  }
  code = lines.join('\\n');
}

fs.writeFileSync(f, code, 'utf8');
const total = fs.readFileSync(f, 'utf8').split('\\n').length;
console.log('extractSenderName fixed! Total lines:', total);
