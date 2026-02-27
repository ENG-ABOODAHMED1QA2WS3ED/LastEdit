const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\main\\matching-engine.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Add a force-update right after loadConfig
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('this.config = this.loadConfig()')) {
    lines.splice(i + 1, 0,
      "    // Force thresholds",
      "    try { this.db.prepare(\"UPDATE matching_config SET value='45' WHERE key='suggestion_threshold'\").run(); } catch(e) {}",
      "    try { this.db.prepare(\"UPDATE matching_config SET value='0.5' WHERE key='min_name_similarity'\").run(); } catch(e) {}",
      "    this.config = this.loadConfig(); // reload"
    );
    console.log('Force update inserted at line', i + 2);
    break;
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done! Lines:', fs.readFileSync(f, 'utf8').split('\n').length);
