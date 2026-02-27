const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Find where to add - before confirmSaveClosing
let insertAt = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function confirmSaveClosing()')) { insertAt = i; break; }
}

if (insertAt !== -1) {
    const newFunc = [
        'async function loadPreviousClosing() {',
        '    try {',
        '        const result = await window.api.getLastClosing();',
        '        if (result.success && result.closing) {',
        '            const el = document.getElementById("previousClosingInfo");',
        '            if (el) {',
        '                const c = result.closing;',
        '                el.innerHTML = "<div style=\\"padding:10px\\"><strong>آخر إقفال:</strong> " + (c.closing_date || "") + " بواسطة " + (c.user_name || "غير معروف") + "<br>"',
        '                    + "المبيعات: " + formatCurrency(parseFloat(c.total_sales)||0) + " | النقد: " + formatCurrency(parseFloat(c.total_cash)||0) + "</div>";',
        '            }',
        '        } else {',
        '            const el = document.getElementById("previousClosingInfo");',
        '            if (el) el.innerHTML = "<div style=\\"text-align:center;padding:20px;color:#999\\">لا يوجد إقفال سابق</div>";',
        '        }',
        '    } catch (e) {',
        '        console.error("خطأ تحميل الإقفال السابق:", e);',
        '    }',
        '}',
        ''
    ];
    lines.splice(insertAt, 0, ...newFunc);
    fs.writeFileSync(f, lines.join('\n'), 'utf8');
    console.log('loadPreviousClosing added at line', insertAt + 1);
    console.log('Total:', lines.length, 'lines');
} else {
    console.log('ERROR: could not find insert point');
}
