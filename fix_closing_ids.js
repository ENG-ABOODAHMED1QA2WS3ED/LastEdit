const fs = require('fs');
const f = 'C:\\dev\\abu-kamil-pos\\src\\renderer\\scripts\\closing.js';
let code = fs.readFileSync(f, 'utf8');

// Fix button IDs
code = code.replace(/getElementById\("btnPrintReport"\)/g, 'getElementById("btnPrintClosing")');
code = code.replace(/getElementById\("btnExportCSV"\)/g, 'getElementById("btnExportClosing")');

// Fix section IDs
code = code.replace(/getElementById\("todayInvoices"\)/g, 'getElementById("invoicesListBody")');
code = code.replace(/getElementById\("todayDebts"\)/g, 'getElementById("newDebtsSection")');
code = code.replace(/getElementById\("previousClosing"\)/g, 'getElementById("previousClosingInfo")');
code = code.replace(/getElementById\("paymentDistribution"\)/g, 'getElementById("paymentMatchStatus")');
code = code.replace(/getElementById\("cashComparison"\)/g, 'getElementById("expectedCash")');

// Fix renderSalesSummary to use individual elements
const oldSalesSummary = 'function renderSalesSummary() {' +
    '\\n    const stats = closingData.stats || {};' +
    '\\n    const el = document.getElementById("salesSummary");' +
    '\\n    if (!el) return;';

const newSalesSummary = 'function renderSalesSummary() {' +
    '\\n    const stats = closingData.stats || {};' +
    '\\n    const el = document.getElementById("summaryTotalSales");';

code = code.replace(
    /function renderSalesSummary\(\) \{\n    const stats = closingData\.stats \|\| \{\};\n    const el = document\.getElementById\("salesSummary"\);\n    if \(!el\) return;/,
    'function renderSalesSummary() {\\n    const stats = closingData.stats || {};'
);

// Replace entire renderSalesSummary
const salesStart = code.indexOf('function renderSalesSummary()');
const salesEnd = code.indexOf('function renderPaymentDistribution()');
if (salesStart !== -1 && salesEnd !== -1) {
    const newRenderSales = \unction renderSalesSummary() {
    const stats = closingData.stats || {};
    const el1 = document.getElementById("summaryTotalSales");
    if (el1) el1.textContent = formatCurrency(parseFloat(stats.sales_total) || 0);
    const el2 = document.getElementById("summaryInvoiceCount");
    if (el2) el2.textContent = stats.sales_count || 0;
    const el3 = document.getElementById("summaryAvgInvoice");
    if (el3) {
        const avg = stats.sales_count > 0 ? (parseFloat(stats.sales_total)||0) / stats.sales_count : 0;
        el3.textContent = formatCurrency(avg);
    }
    // Payment bars
    const total = parseFloat(stats.sales_total) || 0;
    const cash = parseFloat(stats.cash_total) || 0;
    const transfers = parseFloat(stats.transfers_total) || 0;
    const debts = parseFloat(stats.debts_total) || 0;
    const pCash = total > 0 ? ((cash/total)*100).toFixed(1) : 0;
    const pTrans = total > 0 ? ((transfers/total)*100).toFixed(1) : 0;
    const pDebt = total > 0 ? ((debts/total)*100).toFixed(1) : 0;
    const eCash = document.getElementById("payCash");
    if (eCash) eCash.textContent = formatCurrency(cash);
    const eCashPct = document.getElementById("payCashPct");
    if (eCashPct) eCashPct.textContent = pCash + "%";
    const eBarCash = document.getElementById("barCash");
    if (eBarCash) eBarCash.style.width = pCash + "%";
    const eTrans = document.getElementById("payTransfers");
    if (eTrans) eTrans.textContent = formatCurrency(transfers);
    const eTransPct = document.getElementById("payTransfersPct");
    if (eTransPct) eTransPct.textContent = pTrans + "%";
    const eBarTrans = document.getElementById("barTransfers");
    if (eBarTrans) eBarTrans.style.width = pTrans + "%";
    const eDebt = document.getElementById("payDebts");
    if (eDebt) eDebt.textContent = formatCurrency(debts);
    const eDebtPct = document.getElementById("payDebtsPct");
    if (eDebtPct) eDebtPct.textContent = pDebt + "%";
    const eBarDebt = document.getElementById("barDebts");
    if (eBarDebt) eBarDebt.style.width = pDebt + "%";
    const eTotal = document.getElementById("payTotal");
    if (eTotal) eTotal.textContent = formatCurrency(total);
    // Date and time
    const dateEl = document.getElementById("closingDateText");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("ar");
    const timeEl = document.getElementById("closingTime");
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString("ar");
    const userEl = document.getElementById("closingUser");
    if (userEl) userEl.textContent = currentUser ? (currentUser.name || currentUser.username) : "admin";
    const countEl = document.getElementById("invoicesCount");
    if (countEl) countEl.textContent = stats.sales_count || 0;
}

\;
    code = code.substring(0, salesStart) + newRenderSales + code.substring(salesEnd);
}

// Fix renderCashComparison to use correct IDs
code = code.replace(
    /function renderCashComparison\(\) \{[\s\S]*?updateCashComparison\(\);\n\}/,
    \unction renderCashComparison() {
    const stats = closingData.stats || {};
    const expected = parseFloat(stats.cash_total) || 0;
    const expEl = document.getElementById("expectedCash");
    if (expEl) expEl.textContent = formatCurrency(expected);
    const barExp = document.getElementById("barExpectedCash");
    if (barExp) barExp.style.width = "100%";
    updateCashComparison();
}\
);

// Fix updateCashComparison
code = code.replace(
    /function updateCashComparison\(\) \{[\s\S]*?\n\}/,
    \unction updateCashComparison() {
    const stats = closingData.stats || {};
    const expected = parseFloat(stats.cash_total) || 0;
    const diff = actualCashAmount - expected;
    const diffEl = document.getElementById("cashDifference");
    if (diffEl) {
        const sign = diff > 0 ? "+" : "";
        diffEl.textContent = sign + formatCurrency(diff);
    }
    const statusEl = document.getElementById("cashDiffStatus");
    if (statusEl) {
        if (Math.abs(diff) < 0.5) { statusEl.textContent = "متطابق"; statusEl.style.color = "#4CAF50"; }
        else if (diff > 0) { statusEl.textContent = "زيادة"; statusEl.style.color = "#FF9800"; }
        else { statusEl.textContent = "نقص"; statusEl.style.color = "#f44336"; }
    }
    const barActual = document.getElementById("barActualCash");
    if (barActual && expected > 0) barActual.style.width = Math.min(100, (actualCashAmount/expected)*100) + "%";
}\
);

// Fix renderTodayInvoices to use invoicesListBody (table body)
code = code.replace(
    /function renderTodayInvoices\(\) \{[\s\S]*?el\.innerHTML = html;\n\}/,
    \unction renderTodayInvoices() {
    const invoices = closingData.invoices || [];
    const el = document.getElementById("invoicesListBody");
    if (!el) return;
    const today = new Date().toISOString().split("T")[0];
    const todayInvoices = invoices.filter(inv => inv.created_at && inv.created_at.startsWith(today));
    if (todayInvoices.length === 0) {
        el.innerHTML = "<tr><td colspan=\\\\"5\\\\" style=\\\\"text-align:center;padding:20px;color:#999\\\\">لا توجد فواتير اليوم</td></tr>";
        return;
    }
    let html = "";
    todayInvoices.forEach((inv, i) => {
        const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";
        const status = inv.status === "completed" ? "مكتملة" : (inv.status || "");
        html += "<tr><td>" + (i+1) + "</td><td>" + (inv.customer_name||"زبون عام") + "</td><td>" + formatCurrency(parseFloat(inv.total)||0) + "</td><td>" + status + "</td><td>" + time + "</td></tr>";
    });
    el.innerHTML = html;
}\
);

// Remove renderPaymentDistribution (merged into renderSalesSummary)
code = code.replace(/function renderPaymentDistribution\(\) \{[\s\S]*?\n\}\n/, '');

// Remove call to renderPaymentDistribution in loadClosingData
code = code.replace('renderPaymentDistribution();\\n', '');
code = code.replace('renderPaymentDistribution();', '');

// Fix confirmModal ID usage
code = code.replace(/closeModal\("confirmModal"\)/g, 'closeModal("confirmModal")');

fs.writeFileSync(f, code, 'utf8');
console.log('IDs fixed!');
console.log('Total:', fs.readFileSync(f,'utf8').split('\\n').length, 'lines');
