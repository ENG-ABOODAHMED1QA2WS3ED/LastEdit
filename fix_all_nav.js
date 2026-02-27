const fs = require('fs');
const path = require('path');
const dir = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\pages';

const pages = ['customers.html', 'debts.html', 'invoice.html', 'products.html', 'reports.html', 'settings.html', 'matching.html', 'closing.html', 'balances.html'];

pages.forEach(page => {
    const f = path.join(dir, page);
    if (!fs.existsSync(f)) return;
    let code = fs.readFileSync(f, 'utf8');
    
    // Skip if already has index.html link
    if (code.includes('href="index.html"')) {
        console.log(page + ': already has home link');
        return;
    }
    
    // Find <nav class="sidebar-nav"> and add home link after it
    const navTag = code.match(/<nav[^>]*class="sidebar-nav"[^>]*>/);
    if (navTag) {
        const homeLink = navTag[0] + '\n            <a href="index.html" class="nav-item">\n                <span class="nav-icon">\uD83C\uDFE0</span><span>\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629</span>\n            </a>';
        code = code.replace(navTag[0], homeLink);
        fs.writeFileSync(f, code, 'utf8');
        console.log(page + ': home link ADDED');
    } else {
        console.log(page + ': nav not found!');
    }
});
