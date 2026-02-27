const NameNormalizer = require('./src/main/name-normalizer');

const tests = [
  ['احمد نصار ابو ثريا', 'أحمد أبوثريا'],
  ['بشار اياد عوض الخضري', 'بشار الخضري'],
  ['Sanaa Saleh Husain Al Mashharawi', 'سناء المشهراوي'],
  ['Sanaa Saleh Husain Al Mashharawi', 'Sanaa Saleh Husain Al Mashharawi'],
  ['احمد نصار ابو ثريا', 'احمد نصار ابو ثريا'],
];

tests.forEach(([a, b]) => {
  const sim = NameNormalizer.similarity(a, b);
  console.log(sim.toFixed(2) + ' | ' + a + ' <-> ' + b);
});

console.log('\n=== bestMatch test ===');
const s1 = NameNormalizer.bestMatch('احمد نصار ابو ثريا', 'أحمد أبوثريا', null, ['احمد نصار ابو ثريا']);
console.log('Ahmad bestMatch:', s1.toFixed(2));

const s2 = NameNormalizer.bestMatch('بشار اياد عوض الخضري', 'بشار الخضري', null, []);
console.log('Bashar bestMatch:', s2.toFixed(2));

process.exit();
