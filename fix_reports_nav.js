const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\pages\\reports.html';
let code = fs.readFileSync(f, 'utf8');

const oldNav = '<nav class="sidebar-nav">\n            <a href="invoice.html" class="nav-item">';

const newNav = '<nav class="sidebar-nav">\n            <a href="index.html" class="nav-item">\n                <span class="nav-icon">\uD83C\uDFE0</span><span>\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629</span>\n            </a>\n            <a href="invoice.html" class="nav-item">';

code = code.replace(oldNav, newNav);

// Add matching and closing before reports
const oldReports = '<a href="reports.html" class="nav-item active">';
const newReports = '<a href="matching.html" class="nav-item">\n                <span class="nav-icon">\uD83D\uDD04</span><span>\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u064A\u0648\u0645\u064A\u0629</span>\n            </a>\n            <a href="reports.html" class="nav-item active">';

code = code.replace(oldReports, newReports);

// Add closing after settings
const oldSettings = '<a href="settings.html" class="nav-item">\n                <span class="nav-icon">\u2699\uFE0F</span><span>\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A</span>\n            </a>';
const newSettings = oldSettings + '\n            <a href="closing.html" class="nav-item">\n                <span class="nav-icon">\uD83D\uDD12</span><span>\u0625\u0642\u0641\u0627\u0644 \u0627\u0644\u064A\u0648\u0645\u064A\u0629</span>\n            </a>';

code = code.replace(oldSettings, newSettings);

fs.writeFileSync(f, code, 'utf8');
console.log('Reports sidebar fixed!');
