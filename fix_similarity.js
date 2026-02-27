const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\name-normalizer.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Fix 1: Remove the includes shortcut (line 156) - too aggressive
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("n1.includes(n2) || n2.includes(n1)") && lines[i].includes("return 0.9")) {
    lines[i] = "    // removed: includes shortcut was too aggressive";
    console.log('Fix 1: removed includes shortcut at line', i+1);
  }
}

// Fix 2: phoneticSimilarity - tighten thresholds (lines 135-137)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("coverageShort >= 0.8") && lines[i].includes("return Math.max(0.85")) {
    lines[i] = "    if (coverageShort >= 0.8) return coverageAll * 0.9;";
    console[i+1] && (lines[i+1] = lines[i+1].replace(
      "if (coverageShort >= 0.6) return Math.max(0.7, coverageAll * 0.9);",
      "if (coverageShort >= 0.6) return coverageAll * 0.8;"
    ));
    console.log('Fix 2: tightened phoneticSimilarity thresholds at line', i+1);
  }
}

// Fix 3: similarity - tighten word match thresholds (lines 187-188)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("coverageShort >= 0.9") && lines[i].includes("return Math.max(0.85")) {
    lines[i] = "    if (coverageShort >= 0.9 && matchedWords >= 2) return Math.min(0.9, coverageAll + 0.1);";
    console.log('Fix 3a at line', i+1);
  }
  if (lines[i].includes("coverageShort >= 0.7") && lines[i].includes("return Math.max(0.7")) {
    lines[i] = "    if (coverageShort >= 0.7 && matchedWords >= 2) return Math.min(0.75, coverageAll + 0.05);";
    console.log('Fix 3b at line', i+1);
  }
}

// Fix 4: Increase levenshtein strictness for short words in phoneticSimilarity
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("if (s > 0.6 && s > bestScore)") && i > 80 && i < 140) {
    lines[i] = "          if (s > 0.7 && s > bestScore) { bestScore = s; bestIdx = j; }";
    console.log('Fix 4: stricter levenshtein threshold at line', i+1);
  }
}

// Fix 5: Require minimum word length for matching in similarity
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("if (dist <= Math.floor(maxLen * 0.3))") && i > 140) {
    lines[i] = "          if (dist <= Math.floor(maxLen * 0.25)) {";
    console.log('Fix 5: stricter similarity levenshtein at line', i+1);
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('All fixes applied! Lines:', lines.length);
