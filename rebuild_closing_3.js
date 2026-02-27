const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
const lines = [];

// renderCashComparison
lines.push('function renderCashComparison() {');
lines.push('    const el = document.getElementById("cashComparison");');
lines.push('    if (!el) return;');
lines.push('    const stats = closingData.stats || {};');
lines.push('    const expected = parseFloat(stats.cash_total) || 0;');
lines.push('    const expEl = document.getElementById("expectedCash");');
lines.push('    if (expEl) expEl.textContent = formatCurrency(expected);');
lines.push('    updateCashComparison();');
lines.push('}');
lines.push('');
lines.push('function updateCashComparison() {');
lines.push('    const stats = closingData.stats || {};');
lines.push('    const expected = parseFloat(stats.cash_total) || 0;');
lines.push('    const diff = actualCashAmount - expected;');
lines.push('    const diffEl = document.getElementById("cashDifference");');
lines.push('    if (diffEl) {');
lines.push('        const sign = diff > 0 ? "+" : "";');
lines.push('        diffEl.textContent = sign + formatCurrency(diff);');
lines.push('        diffEl.className = Math.abs(diff) < 0.5 ? "diff-ok" : (diff > 0 ? "diff-over" : "diff-under");');
lines.push('    }');
lines.push('}');
lines.push('');

// renderTodayInvoices
lines.push('function renderTodayInvoices() {');
lines.push('    const invoices = closingData.invoices || [];');
lines.push('    const el = document.getElementById("todayInvoices");');
lines.push('    if (!el) return;');
lines.push('    const today = new Date().toISOString().split("T")[0];');
lines.push('    const todayInvoices = invoices.filter(inv => inv.created_at && inv.created_at.startsWith(today));');
lines.push('    if (todayInvoices.length === 0) {');
lines.push('        el.innerHTML = "<div style=\\"text-align:center;padding:20px;color:#999\\">لا توجد فواتير اليوم</div>";');
lines.push('        return;');
lines.push('    }');
lines.push('    let html = "<table style=\\"width:100%;border-collapse:collapse\\">";');
lines.push('    html += "<tr style=\\"background:#f5f5f5\\"><th style=\\"padding:8px;text-align:right\\">#</th><th style=\\"padding:8px;text-align:right\\">الزبون</th><th style=\\"padding:8px;text-align:right\\">المبلغ</th><th style=\\"padding:8px;text-align:right\\">الوقت</th></tr>";');
lines.push('    todayInvoices.forEach((inv, i) => {');
lines.push('        const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";');
lines.push('        html += "<tr style=\\"border-bottom:1px solid #eee\\"><td style=\\"padding:8px\\">" + (i+1) + "</td><td style=\\"padding:8px\\">" + (inv.customer_name||"زبون عام") + "</td><td style=\\"padding:8px\\">" + formatCurrency(parseFloat(inv.total)||0) + "</td><td style=\\"padding:8px\\">" + time + "</td></tr>";');
lines.push('    });');
lines.push('    html += "</table>";');
lines.push('    el.innerHTML = html;');
lines.push('}');
lines.push('');

// loadPreviousClosing
lines.push('async function loadPreviousClosing() {');
lines.push('    try {');
lines.push('        const result = await window.api.getLastClosing();');
lines.push('        if (result.success && result.closing) {');
lines.push('            const el = document.getElementById("previousClosing");');
lines.push('            if (el) {');
lines.push('                const c = result.closing;');
lines.push('                const data = c.closing_data || {};');
lines.push('                el.innerHTML = "<div style=\\"padding:10px\\"><strong>آخر إقفال:</strong> " + (c.closing_date || "") + " بواسطة " + (c.user_name || "غير معروف") + "<br>"');
lines.push('                    + "المبيعات: " + formatCurrency(parseFloat(c.total_sales)||0) + " | النقد: " + formatCurrency(parseFloat(c.total_cash)||0) + "</div>";');
lines.push('            }');
lines.push('        }');
lines.push('    } catch (e) {');
lines.push('        console.error("خطأ تحميل الإقفال السابق:", e);');
lines.push('    }');
lines.push('}');
lines.push('');

fs.appendFileSync(f, '\n' + lines.join('\n'), 'utf8');
console.log('Part 3 done:', lines.length, 'new lines');
console.log('Total:', fs.readFileSync(f,'utf8').split('\n').length, 'lines');
