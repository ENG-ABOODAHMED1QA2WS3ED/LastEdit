const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Find and replace renderSalesSummary
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function renderSalesSummary()')) start = i;
    if (start !== -1 && i > start && lines[i].startsWith('function ')) { end = i; break; }
}

if (start !== -1 && end !== -1) {
    const newFunc = [
        'function renderSalesSummary() {',
        '    const stats = closingData.stats || {};',
        '    const el1 = document.getElementById("summaryTotalSales");',
        '    if (el1) el1.textContent = formatCurrency(parseFloat(stats.sales_total) || 0);',
        '    const el2 = document.getElementById("summaryInvoiceCount");',
        '    if (el2) el2.textContent = stats.sales_count || 0;',
        '    const el3 = document.getElementById("summaryAvgInvoice");',
        '    if (el3) {',
        '        const avg = stats.sales_count > 0 ? (parseFloat(stats.sales_total)||0) / stats.sales_count : 0;',
        '        el3.textContent = formatCurrency(avg);',
        '    }',
        '    const total = parseFloat(stats.sales_total) || 0;',
        '    const cash = parseFloat(stats.cash_total) || 0;',
        '    const transfers = parseFloat(stats.transfers_total) || 0;',
        '    const debts = parseFloat(stats.debts_total) || 0;',
        '    const pCash = total > 0 ? ((cash/total)*100).toFixed(1) : 0;',
        '    const pTrans = total > 0 ? ((transfers/total)*100).toFixed(1) : 0;',
        '    const pDebt = total > 0 ? ((debts/total)*100).toFixed(1) : 0;',
        '    const eCash = document.getElementById("payCash");',
        '    if (eCash) eCash.textContent = formatCurrency(cash);',
        '    const eCashPct = document.getElementById("payCashPct");',
        '    if (eCashPct) eCashPct.textContent = pCash + "%";',
        '    const eBarCash = document.getElementById("barCash");',
        '    if (eBarCash) eBarCash.style.width = pCash + "%";',
        '    const eTrans = document.getElementById("payTransfers");',
        '    if (eTrans) eTrans.textContent = formatCurrency(transfers);',
        '    const eTransPct = document.getElementById("payTransfersPct");',
        '    if (eTransPct) eTransPct.textContent = pTrans + "%";',
        '    const eBarTrans = document.getElementById("barTransfers");',
        '    if (eBarTrans) eBarTrans.style.width = pTrans + "%";',
        '    const eDebt = document.getElementById("payDebts");',
        '    if (eDebt) eDebt.textContent = formatCurrency(debts);',
        '    const eDebtPct = document.getElementById("payDebtsPct");',
        '    if (eDebtPct) eDebtPct.textContent = pDebt + "%";',
        '    const eBarDebt = document.getElementById("barDebts");',
        '    if (eBarDebt) eBarDebt.style.width = pDebt + "%";',
        '    const eTotal = document.getElementById("payTotal");',
        '    if (eTotal) eTotal.textContent = formatCurrency(total);',
        '    const dateEl = document.getElementById("closingDateText");',
        '    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("ar");',
        '    const timeEl = document.getElementById("closingTime");',
        '    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString("ar");',
        '    const userEl2 = document.getElementById("closingUser");',
        '    if (userEl2) userEl2.textContent = currentUser ? (currentUser.name || currentUser.username) : "admin";',
        '    const countEl = document.getElementById("invoicesCount");',
        '    if (countEl) countEl.textContent = stats.sales_count || 0;',
        '}',
        ''
    ];
    lines.splice(start, end - start, ...newFunc);
}

// Remove renderPaymentDistribution function
start = -1; end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function renderPaymentDistribution()')) start = i;
    if (start !== -1 && i > start && lines[i].startsWith('function ')) { end = i; break; }
}
if (start !== -1 && end !== -1) {
    lines.splice(start, end - start);
}

// Fix renderCashComparison
start = -1; end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function renderCashComparison()')) start = i;
    if (start !== -1 && i > start && lines[i].startsWith('function ')) { end = i; break; }
}
if (start !== -1 && end !== -1) {
    const newCash = [
        'function renderCashComparison() {',
        '    const stats = closingData.stats || {};',
        '    const expected = parseFloat(stats.cash_total) || 0;',
        '    const expEl = document.getElementById("expectedCash");',
        '    if (expEl) expEl.textContent = formatCurrency(expected);',
        '    const barExp = document.getElementById("barExpectedCash");',
        '    if (barExp) barExp.style.width = "100%";',
        '    updateCashComparison();',
        '}',
        ''
    ];
    lines.splice(start, end - start, ...newCash);
}

// Fix updateCashComparison
start = -1; end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function updateCashComparison()')) start = i;
    if (start !== -1 && i > start && lines[i].startsWith('function ')) { end = i; break; }
}
if (start !== -1 && end !== -1) {
    const newUpdate = [
        'function updateCashComparison() {',
        '    const stats = closingData.stats || {};',
        '    const expected = parseFloat(stats.cash_total) || 0;',
        '    const diff = actualCashAmount - expected;',
        '    const diffEl = document.getElementById("cashDifference");',
        '    if (diffEl) {',
        '        const sign = diff > 0 ? "+" : "";',
        '        diffEl.textContent = sign + formatCurrency(diff);',
        '    }',
        '    const statusEl = document.getElementById("cashDiffStatus");',
        '    if (statusEl) {',
        '        if (Math.abs(diff) < 0.5) { statusEl.textContent = "متطابق"; statusEl.style.color = "#4CAF50"; }',
        '        else if (diff > 0) { statusEl.textContent = "زيادة"; statusEl.style.color = "#FF9800"; }',
        '        else { statusEl.textContent = "نقص"; statusEl.style.color = "#f44336"; }',
        '    }',
        '    const barActual = document.getElementById("barActualCash");',
        '    if (barActual && expected > 0) barActual.style.width = Math.min(100, (actualCashAmount/expected)*100) + "%";',
        '}',
        ''
    ];
    lines.splice(start, end - start, ...newUpdate);
}

// Fix renderTodayInvoices
start = -1; end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function renderTodayInvoices()')) start = i;
    if (start !== -1 && i > start && lines[i].startsWith('function ') && lines[i] !== lines[start]) { end = i; break; }
}
if (start !== -1 && end !== -1) {
    const newInv = [
        'function renderTodayInvoices() {',
        '    const invoices = closingData.invoices || [];',
        '    const el = document.getElementById("invoicesListBody");',
        '    if (!el) return;',
        '    const today = new Date().toISOString().split("T")[0];',
        '    const todayInvoices = invoices.filter(inv => inv.created_at && inv.created_at.startsWith(today));',
        '    if (todayInvoices.length === 0) {',
        '        el.innerHTML = "<tr><td colspan=\\"5\\" style=\\"text-align:center;padding:20px;color:#999\\">لا توجد فواتير اليوم</td></tr>";',
        '        return;',
        '    }',
        '    let html = "";',
        '    todayInvoices.forEach((inv, i) => {',
        '        const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";',
        '        const status = inv.status === "completed" ? "مكتملة" : (inv.status || "");',
        '        html += "<tr><td>" + (i+1) + "</td><td>" + (inv.customer_name||"زبون عام") + "</td><td>" + formatCurrency(parseFloat(inv.total)||0) + "</td><td>" + status + "</td><td>" + time + "</td></tr>";',
        '    });',
        '    el.innerHTML = html;',
        '}',
        ''
    ];
    lines.splice(start, end - start, ...newInv);
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Functions replaced!');
console.log('Total:', lines.length, 'lines');
