const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\name-normalizer.js';
let code = fs.readFileSync(f, 'utf8');

// === FIX 1: Add NFKD normalization at the very start of normalize() ===
// Find: static normalize(name) {
// Add NFKD as first step
code = code.replace(
  /static normalize\(name\)\s*\{/,
  static normalize(name) {
    // STEP 0: Unicode NFKD decomposition - converts Arabic Presentation Forms to standard Arabic
    if (name) name = name.normalize('NFKD');
);

// === FIX 2: Add NFKD to normalizeArabic() too ===
code = code.replace(
  /static normalizeArabic\(name\)\s*\{/,
  static normalizeArabic(name) {
    // NFKD decomposition first
    if (name) name = name.normalize('NFKD');
);

// === FIX 3: Add NFKD to phoneticSkeleton() ===
code = code.replace(
  /static phoneticSkeleton\(name\)\s*\{/,
  static phoneticSkeleton(name) {
    // NFKD decomposition first
    if (name) name = name.normalize('NFKD');
);

// === FIX 4: Add NFKD to arabicToPhonetic() ===
code = code.replace(
  /static arabicToPhonetic\(name\)\s*\{/,
  static arabicToPhonetic(name) {
    // NFKD decomposition first
    if (name) name = name.normalize('NFKD');
);

// === FIX 5: Fix isArabic to detect presentation forms too ===
code = code.replace(
  /static isArabic\(name\)\s*\{[^}]*\}/,
  static isArabic(name) {
    return /[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/.test(name);
  }
);

// === FIX 6: Normalize ی (U+06CC Farsi yeh) to ي (U+064A Arabic yeh) in normalizeArabic ===
// Find the line that normalizes ى and add ی
code = code.replace(
  /(\.replace\(\/\[ى\]\/g,\s*'ي'\))/,
  .replace(/[ىی]/g, 'ي')
);

fs.writeFileSync(f, code, 'utf8');

// Verify
const result = fs.readFileSync(f, 'utf8');
const hasNFKD = (result.match(/normalize\('NFKD'\)/g) || []).length;
const hasPresentationForms = result.includes('\\uFB50');
console.log('NFKD additions:', hasNFKD);
console.log('Presentation forms in isArabic:', hasPresentationForms);
console.log('Total lines:', result.split('\n').length);
console.log('Done! Restart app to test.');
