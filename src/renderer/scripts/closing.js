// ==================== إقفال اليومية ====================
// الإصدار 6.0 - مع دعم التحويلات المتأخرة

let closingData = {};
let actualCashAmount = 0;
let currentUser = null;
let closingNotes = "";

// ==================== تهيئة الصفحة ====================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const userData = sessionStorage.getItem("currentUser") || localStorage.getItem("currentUser");
        if (userData) {
            currentUser = JSON.parse(userData);
            const userEl = document.getElementById("currentUserName");
            if (userEl) userEl.textContent = currentUser.name || currentUser.username;
        }
        setupEventListeners();
        await loadClosingData();
        console.log("صفحة الإقفال جاهزة");
    } catch (e) {
        console.error("خطأ تهيئة الإقفال:", e);
        showToast("خطأ في تحميل البيانات", "error");
    }
});

function setupEventListeners() {
    const btnSave = document.getElementById("btnSaveClosing");
    if (btnSave) btnSave.addEventListener("click", confirmSaveClosing);
    const btnConfirm = document.getElementById("btnConfirmSave");
    if (btnConfirm) btnConfirm.addEventListener("click", doSaveClosing);
    const btnPrint = document.getElementById("btnPrintClosing");
    if (btnPrint) btnPrint.addEventListener("click", printReport);
    const btnExport = document.getElementById("btnExportClosing");
    if (btnExport) btnExport.addEventListener("click", exportCSV);
    const cashInput = document.getElementById("actualCashInput");
    if (cashInput) {
        cashInput.addEventListener("input", (e) => {
            actualCashAmount = parseFloat(e.target.value) || 0;
            updateCashComparison();
        });
    }
    const notesInput = document.getElementById("closingNotes");
    if (notesInput) {
        notesInput.addEventListener("input", (e) => { closingNotes = e.target.value; });
    }
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", handleLogout);

    const btnCancelSave = document.getElementById("btnCancelSave");
    if (btnCancelSave) btnCancelSave.addEventListener("click", () => closeModal("confirmModal"));
    const btnClosePrevious = document.getElementById("btnClosePrevious");
    if (btnClosePrevious) btnClosePrevious.addEventListener("click", () => closeModal("previousModal"));
    const btnCloseDone = document.getElementById("btnCloseDone");
    if (btnCloseDone) btnCloseDone.addEventListener("click", () => { window.location.href = "index.html"; });

    // CSP-compliant: handle data-close-modal buttons
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => {
            const modalId = btn.getAttribute("data-close-modal");
            closeModal(modalId);
        });
    });
    document.querySelectorAll(".modal-close, .btn-cancel-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal-overlay");
            if (modal) modal.classList.remove("active");
        });
    });
}

async function loadClosingData() {
    try {
        const [statsRes, debtsRes, transfersRes, invoicesRes, overdueRes] = await Promise.all([
            window.api.getTodayStats(),
            window.api.getOutstandingDebts(),
            window.api.getPendingTransfers(),
            window.api.getRecentInvoices(200),
            window.api.getOverdueTransfers ? window.api.getOverdueTransfers() : { success: true, transfers: [] }
        ]);
        closingData.stats = statsRes.success ? statsRes.stats : {};
        closingData.debts = debtsRes.success ? debtsRes.debts : [];
        closingData.transfers = transfersRes.success ? transfersRes.transfers : [];
        closingData.invoices = invoicesRes.success ? invoicesRes.invoices : [];
        closingData.overdueTransfers = overdueRes.success ? overdueRes.transfers : [];
        console.log("بيانات الإقفال:", closingData.stats);
        renderSalesSummary();
        renderPendingWarnings();
        renderTodayDebts();
        renderCashComparison();
        renderTodayInvoices();
        await loadPreviousClosing();
    } catch (e) {
        console.error("خطأ تحميل بيانات الإقفال:", e);
        showToast("خطأ في تحميل البيانات", "error");
    }
}

function renderSalesSummary() {
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
    const dateEl = document.getElementById("closingDateText");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("ar");
    const timeEl = document.getElementById("closingTime");
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString("ar");
    const userEl2 = document.getElementById("closingUser");
    if (userEl2) userEl2.textContent = currentUser ? (currentUser.name || currentUser.username) : "admin";
    const countEl = document.getElementById("invoicesCount");
    if (countEl) countEl.textContent = stats.sales_count || 0;
}

function renderPendingWarnings() {
    const transfers = closingData.transfers || [];
    const overdueTransfers = closingData.overdueTransfers || [];
    const el = document.getElementById("pendingWarnings");
    if (!el) return;
    let html = "";

    // === التحويلات المتأخرة ===
    if (overdueTransfers.length > 0) {
        let overdueTotal = overdueTransfers.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
        html += "<div class=\"warning-card danger\" style=\"border:2px solid #ff4444;background:#fff5f5;padding:15px;border-radius:10px;margin-bottom:15px\">";
        html += "<h4 style=\"color:#ff4444;margin:0 0 10px\">\u26D4 تحويلات متأخرة (" + overdueTransfers.length + ") - " + formatCurrency(overdueTotal) + "</h4>";
        overdueTransfers.forEach(t => {
            const deadlineDate = t.transfer_deadline ? new Date(t.transfer_deadline).toLocaleString("ar") : "غير محدد";
            html += "<div id=\"overdue-" + t.id + "\" class=\"overdue-item\" style=\"background:#fff;border:1px solid #ffcdd2;border-radius:8px;padding:10px;margin:8px 0;display:flex;justify-content:space-between;align-items:center\">";
            html += "<div><strong>" + (t.customer_name || "غير معروف") + "</strong> - " + formatCurrency(parseFloat(t.amount) || 0) + "<br><small style=\"color:#999\">المهلة: " + deadlineDate + "</small></div>";
            html += "<div style=\"display:flex;gap:8px\">";
            html += "<button onclick=\"convertToDebt(" + t.id + ")\" class=\"btn btn-danger btn-sm\" style=\"padding:5px 12px;font-size:12px\">\u27A1 تحويل لدين</button>";
            html += "<button onclick=\"deferTransfer(" + t.id + ")\" class=\"btn btn-warning btn-sm\" style=\"padding:5px 12px;font-size:12px\">\u23F3 تأجيل لغد</button>";
            html += "</div></div>";
        });
        html += "</div>";
    }

    // === التحويلات المعلقة ===
    const pendingCount = transfers.length;
    const pendingTotal = transfers.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    if (pendingCount === 0 && overdueTransfers.length === 0) {
        html += "<div class=\"success-card\" style=\"background:#e8f5e9;padding:15px;border-radius:10px;text-align:center\"><span style=\"color:#4CAF50;font-size:18px\">\u2705 لا توجد تحويلات معلقة</span></div>";
    } else if (pendingCount > 0) {
        html += "<div class=\"warning-card\" style=\"background:#fff8e1;border:1px solid #ffb300;padding:15px;border-radius:10px\">";
        html += "<h4 style=\"color:#ff8f00;margin:0 0 10px\">\u26A0 تحويلات معلقة (" + pendingCount + ") - " + formatCurrency(pendingTotal) + "</h4>";
        html += "<table style=\"width:100%;border-collapse:collapse\">";
        html += "<tr style=\"background:#fff3e0\"><th style=\"padding:8px;text-align:right\">الزبون</th><th style=\"padding:8px;text-align:right\">المبلغ</th><th style=\"padding:8px;text-align:right\">النوع</th><th style=\"padding:8px;text-align:right\">التاريخ</th></tr>";
        transfers.forEach(t => {
            html += "<tr style=\"border-bottom:1px solid #eee\"><td style=\"padding:8px\">" + (t.customer_name||"") + "</td><td style=\"padding:8px\">" + formatCurrency(parseFloat(t.amount)||0) + "</td><td style=\"padding:8px\">" + getTransferTypeName(t.transfer_type) + "</td><td style=\"padding:8px\">" + formatDate(t.created_at) + "</td></tr>";
        });
        html += "</table></div>";
    }
    el.innerHTML = html;
}

function renderTodayDebts() {
    const debts = closingData.debts || [];
    const el = document.getElementById("newDebtsSection");
    if (!el) return;
    const today = new Date().toISOString().split("T")[0];
    const todayDebts = debts.filter(d => d.created_at && d.created_at.startsWith(today));
    if (todayDebts.length === 0) {
        el.innerHTML = "<div style=\"text-align:center;padding:20px;color:#999\">لا توجد ديون جديدة اليوم</div>";
        return;
    }
    let totalDebt = todayDebts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    let html = "<div style=\"margin-bottom:10px\"><strong>ديون اليوم: " + todayDebts.length + " | الإجمالي: " + formatCurrency(totalDebt) + "</strong></div>";
    html += "<table style=\"width:100%;border-collapse:collapse\">";
    html += "<tr style=\"background:#f5f5f5\"><th style=\"padding:8px;text-align:right\">الزبون</th><th style=\"padding:8px;text-align:right\">المبلغ</th><th style=\"padding:8px;text-align:right\">السبب</th></tr>";
    todayDebts.forEach(d => {
        html += "<tr style=\"border-bottom:1px solid #eee\"><td style=\"padding:8px\">" + (d.customer_name||"") + "</td><td style=\"padding:8px\">" + formatCurrency(parseFloat(d.amount)||0) + "</td><td style=\"padding:8px\">" + (d.debt_reason||"") + "</td></tr>";
    });
    html += "</table>";
    el.innerHTML = html;
}

function renderCashComparison() {
    const stats = closingData.stats || {};
    const expected = parseFloat(stats.cash_total) || 0;
    const expEl = document.getElementById("expectedCash");
    if (expEl) expEl.textContent = formatCurrency(expected);
    const barExp = document.getElementById("barExpectedCash");
    if (barExp) barExp.style.width = "100%";
    updateCashComparison();
}

function updateCashComparison() {
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
}

function renderTodayInvoices() {
    const invoices = closingData.invoices || [];
    const el = document.getElementById("invoicesListBody");
    if (!el) return;
    const today = new Date().toISOString().split("T")[0];
    const todayInvoices = invoices.filter(inv => inv.created_at && inv.created_at.startsWith(today));
    if (todayInvoices.length === 0) {
        el.innerHTML = "<tr><td colspan=\"5\" style=\"text-align:center;padding:20px;color:#999\">لا توجد فواتير اليوم</td></tr>";
        return;
    }
    let html = "";
    todayInvoices.forEach((inv, i) => {
        const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";
        const status = inv.status === "completed" ? "مكتملة" : (inv.status || "");
        html += "<tr><td>" + (i+1) + "</td><td>" + (inv.customer_name||"زبون عام") + "</td><td>" + formatCurrency(parseFloat(inv.total)||0) + "</td><td>" + status + "</td><td>" + time + "</td></tr>";
    });
    el.innerHTML = html;
}

async function loadPreviousClosing() {
    try {
        const result = await window.api.getLastClosing();
        if (result.success && result.closing) {
            const el = document.getElementById("previousClosingInfo");
            if (el) {
                const c = result.closing;
                el.innerHTML = "<div style=\"padding:10px\"><strong>آخر إقفال:</strong> " + (c.closing_date || "") + " بواسطة " + (c.user_name || "غير معروف") + "<br>"
                    + "المبيعات: " + formatCurrency(parseFloat(c.total_sales)||0) + " | النقد: " + formatCurrency(parseFloat(c.total_cash)||0) + "</div>";
            }
        } else {
            const el = document.getElementById("previousClosingInfo");
            if (el) el.innerHTML = "<div style=\"text-align:center;padding:20px;color:#999\">لا يوجد إقفال سابق</div>";
        }
    } catch (e) {
        console.error("خطأ تحميل الإقفال السابق:", e);
    }
}

function confirmSaveClosing() {
    const stats = closingData.stats || {};
    const expectedCash = parseFloat(stats.cash_total) || 0;
    const difference = actualCashAmount - expectedCash;
    const transfers = closingData.transfers || [];
    const overdueTransfers = closingData.overdueTransfers || [];
    const unresolvedOverdue = overdueTransfers.filter(t => !t._resolved);

    const summaryEl = document.getElementById("confirmSummary");
    if (summaryEl) {
        let warnings = "";

        if (unresolvedOverdue.length > 0) {
            warnings += "<div style=\"background:#ff4444;color:#fff;padding:10px;border-radius:8px;margin:5px 0\">"
                + "\u26D4 يوجد " + unresolvedOverdue.length + " تحويل متأخر لم يُتخذ قرار بشأنه! يُنصح بالعودة لقسم التحويلات المتأخرة أعلاه."
                + "</div>";
        }

        if (transfers.length > 0) {
            warnings += "<div class=\"confirm-warning\">\u26A0 يوجد " + transfers.length + " تحويل معلق لم تتم مطابقته</div>";
        }

        if (Math.abs(difference) > 0.5 && actualCashAmount > 0) {
            const diffType = difference > 0 ? "زيادة" : "نقص";
            warnings += "<div class=\"confirm-warning\">\u26A0 يوجد " + diffType + " في الصندوق: " + formatCurrency(Math.abs(difference)) + "</div>";
        }

        if (actualCashAmount === 0 && expectedCash > 0) {
            warnings += "<div class=\"confirm-warning\">\u26A0 لم يتم إدخال المبلغ الفعلي في الصندوق</div>";
        }

        summaryEl.innerHTML = "<div class=\"confirm-details\">"
            + "<div class=\"confirm-row\"><span>إجمالي المبيعات:</span><strong>" + formatCurrency(parseFloat(stats.sales_total)||0) + "</strong></div>"
            + "<div class=\"confirm-row\"><span>عدد الفواتير:</span><strong>" + (stats.sales_count||0) + "</strong></div>"
            + "<div class=\"confirm-row\"><span>النقد المتوقع:</span><strong>" + formatCurrency(expectedCash) + "</strong></div>"
            + "<div class=\"confirm-row\"><span>النقد الفعلي:</span><strong>" + formatCurrency(actualCashAmount) + "</strong></div>"
            + "<div class=\"confirm-row\"><span>الفرق:</span><strong>" + formatCurrency(difference) + "</strong></div>"
            + warnings + "</div>";
    }
    openModal("confirmModal");
}

async function doSaveClosing() {
    console.log('doSaveClosing called');
    let btnConfirm = document.getElementById("btnConfirmSave");
    if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = "جاري الحفظ..."; }

    try {
        const stats = closingData.stats || {};
        const expectedCash = parseFloat(stats.cash_total) || 0;
        const difference = actualCashAmount - expectedCash;
        const overdueTransfers = closingData.overdueTransfers || [];

        const closingRecord = {
            user_id: currentUser ? currentUser.id : 1,
            user_name: currentUser ? (currentUser.name || currentUser.username) : "admin",
            date: new Date().toISOString().split("T")[0],
            data: JSON.stringify({
                total_sales: parseFloat(stats.sales_total) || 0,
                invoice_count: parseInt(stats.sales_count) || 0,
                cash_total: parseFloat(stats.cash_total) || 0,
                transfers_total: parseFloat(stats.transfers_total) || 0,
                debts_total: parseFloat(stats.debts_total) || 0,
                pending_transfers_count: (closingData.transfers || []).length,
                pending_transfers_total: (closingData.transfers || []).reduce((s, t) => s + (parseFloat(t.amount)||0), 0),
                overdue_transfers_count: overdueTransfers.length,
                overdue_converted_to_debt: overdueTransfers.filter(t => t._convertedToDebt).length,
                overdue_deferred: overdueTransfers.filter(t => t._deferred).length,
                new_debts_count: (closingData.debts || []).filter(d => { const today = new Date().toISOString().split("T")[0]; return d.created_at && d.created_at.startsWith(today); }).length,
                actual_cash: actualCashAmount,
                expected_cash: expectedCash,
                cash_difference: difference,
                notes: closingNotes
            }),
            total_sales: parseFloat(stats.sales_total) || 0,
            total_cash: parseFloat(stats.cash_total) || 0,
            total_transfer: parseFloat(stats.transfers_total) || 0,
            total_debt: parseFloat(stats.debts_total) || 0,
            actual_cash: actualCashAmount,
            expected_cash: expectedCash,
            cash_difference: difference
        };

        console.log('closingRecord:', JSON.stringify(closingRecord));
        const result = await window.api.saveDailyClosing(closingRecord);
        console.log('saveDailyClosing result:', result);
        try { console.log('About to check result.success:', result.success); } catch(ee) { console.error('log error:', ee); }
        if (result && result.success) {
            try { showToast("تم حفظ الإقفال بنجاح", "success"); } catch(e1) { console.error("showToast error:", e1); }
            try { closeModal("confirmModal"); } catch(e2) { console.error("closeModal error:", e2); }
            console.log("showToast and closeModal executed");
        } else {
            showToast("خطأ: " + (result.error || "فشل الحفظ"), "error");
        }
    } catch (e) {
        console.error("خطأ حفظ الإقفال:", e);
        showToast("خطأ في حفظ الإقفال", "error");
    } finally {
        if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "تأكيد الحفظ"; }
    }
}

function printReport() {
    const stats = closingData.stats || {};
    const expectedCash = parseFloat(stats.cash_total) || 0;
    const difference = actualCashAmount - expectedCash;
    const today = new Date().toISOString().split("T")[0];
    const invoices = (closingData.invoices || []).filter(inv => inv.created_at && inv.created_at.startsWith(today));
    const todayDebts = (closingData.debts || []).filter(d => d.created_at && d.created_at.startsWith(today));

    let html = "<html dir=\"rtl\"><head><meta charset=\"utf-8\"><title>تقرير الإقفال اليومي</title>";
    html += "<style>body{font-family:Arial,sans-serif;padding:20px;direction:rtl} table{width:100%;border-collapse:collapse;margin:10px 0} th,td{border:1px solid #ddd;padding:8px;text-align:right} th{background:#f5f5f5} h2{color:#333;border-bottom:2px solid #1976d2;padding-bottom:5px} .summary{display:flex;gap:15px;flex-wrap:wrap;margin:10px 0} .summary-item{background:#f0f4ff;padding:10px 15px;border-radius:8px;flex:1;min-width:120px;text-align:center} .summary-item .label{font-size:12px;color:#666} .summary-item .value{font-size:18px;font-weight:bold;color:#1976d2} @media print{body{padding:0}}</style>";
    html += "</head><body>";
    html += "<h1 style=\"text-align:center\">تقرير الإقفال اليومي</h1>";
    html += "<p style=\"text-align:center\">التاريخ: " + today + " | المستخدم: " + (currentUser ? currentUser.name || currentUser.username : "admin") + "</p>";

    html += "<h2>ملخص المبيعات</h2>";
    html += "<div class=\"summary\">";
    html += "<div class=\"summary-item\"><div class=\"label\">الفواتير</div><div class=\"value\">" + (stats.sales_count||0) + "</div></div>";
    html += "<div class=\"summary-item\"><div class=\"label\">الإجمالي</div><div class=\"value\">" + formatCurrency(parseFloat(stats.sales_total)||0) + "</div></div>";
    html += "<div class=\"summary-item\"><div class=\"label\">النقد</div><div class=\"value\">" + formatCurrency(parseFloat(stats.cash_total)||0) + "</div></div>";
    html += "<div class=\"summary-item\"><div class=\"label\">التحويلات</div><div class=\"value\">" + formatCurrency(parseFloat(stats.transfers_total)||0) + "</div></div>";
    html += "<div class=\"summary-item\"><div class=\"label\">الديون</div><div class=\"value\">" + formatCurrency(parseFloat(stats.debts_total)||0) + "</div></div>";
    html += "</div>";

    html += "<h2>مقارنة الصندوق</h2>";
    html += "<table><tr><th>المتوقع</th><th>الفعلي</th><th>الفرق</th></tr>";
    html += "<tr><td>" + formatCurrency(expectedCash) + "</td><td>" + formatCurrency(actualCashAmount) + "</td><td>" + formatCurrency(difference) + "</td></tr></table>";

    if (invoices.length > 0) {
        html += "<h2>فواتير اليوم (" + invoices.length + ")</h2>";
        html += "<table><tr><th>#</th><th>الزبون</th><th>المبلغ</th><th>الوقت</th></tr>";
        invoices.forEach((inv, i) => {
            const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";
            html += "<tr><td>" + (i+1) + "</td><td>" + (inv.customer_name||"زبون عام") + "</td><td>" + formatCurrency(parseFloat(inv.total)||0) + "</td><td>" + time + "</td></tr>";
        });
        html += "</table>";
    }

    if (todayDebts.length > 0) {
        html += "<h2>ديون اليوم (" + todayDebts.length + ")</h2>";
        html += "<table><tr><th>الزبون</th><th>المبلغ</th><th>السبب</th></tr>";
        todayDebts.forEach(d => {
            html += "<tr><td>" + (d.customer_name||"") + "</td><td>" + formatCurrency(parseFloat(d.amount)||0) + "</td><td>" + (d.debt_reason||"") + "</td></tr>";
        });
        html += "</table>";
    }

    if (closingNotes) { html += "<h2>ملاحظات</h2><p>" + closingNotes + "</p>"; }
    html += "</body></html>";

    const printWin = window.open("", "_blank", "width=800,height=600");
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => { printWin.print(); };
}

function exportCSV() {
    const today = new Date().toISOString().split("T")[0];
    const invoices = (closingData.invoices || []).filter(inv => inv.created_at && inv.created_at.startsWith(today));
    let csv = "\uFEFF#,الزبون,المبلغ,الوقت\n";
    invoices.forEach((inv, i) => {
        const time = inv.created_at ? inv.created_at.split(" ")[1] || "" : "";
        csv += (i+1) + "," + (inv.customer_name||"زبون عام") + "," + (parseFloat(inv.total)||0) + "," + time + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "closing_" + today + ".csv";
    link.click();
    showToast("تم تصدير التقرير", "success");
}

async function convertToDebt(paymentId) {
    if (!confirm("هل تريد تحويل هذه الدفعة إلى دين على الزبون؟")) return;
    try {
        const result = await window.api.convertTransferToDebt(paymentId);
        if (result.success) {
            showToast("تم تحويل الدفعة إلى دين بنجاح", "success");
            const overdue = closingData.overdueTransfers || [];
            const item = overdue.find(t => t.id === paymentId);
            if (item) { item._resolved = true; item._convertedToDebt = true; }
            const card = document.getElementById("overdue-" + paymentId);
            if (card) {
                card.style.opacity = "0.5";
                card.innerHTML = "<div style=\"text-align:center;padding:10px;color:#4CAF50\">\u2705 تم تحويلها إلى دين</div>";
            }
        } else {
            showToast("خطأ: " + (result.error || "فشل التحويل"), "error");
        }
    } catch (e) {
        console.error("خطأ تحويل لدين:", e);
        showToast("خطأ في العملية", "error");
    }
}

function deferTransfer(paymentId) {
    const overdue = closingData.overdueTransfers || [];
    const item = overdue.find(t => t.id === paymentId);
    if (item) { item._resolved = true; item._deferred = true; }
    showToast("تم تأجيل التحويل ليوم غد", "info");
    const card = document.getElementById("overdue-" + paymentId);
    if (card) {
        card.style.opacity = "0.5";
        card.innerHTML = "<div style=\"text-align:center;padding:10px;color:#FF9800\">\u23F3 مؤجّل ليوم غد</div>";
    }
}

function formatCurrency(amount) {
    return (parseFloat(amount) || 0).toFixed(2) + " \u20AA";
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try { return new Date(dateStr).toLocaleDateString("ar"); } catch(e) { return dateStr; }
}

function getTransferTypeName(type) {
    const names = { "bank_transfer": "تحويل بنكي", "wallet": "محفظة", "now": "فوري", "later": "لاحق", "deferred": "مؤجل" };
    return names[type] || type || "تحويل";
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("active");
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("active");
}

function showToast(message, type) {
    let container = document.getElementById("toastContainer");
    if (!container) { container = document.createElement("div"); container.id = "toastContainer"; container.className = "toast-container"; document.body.appendChild(container); }
    const toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "info");
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.add("show"); });
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => { toast.remove(); }, 300); }, 3000);
}

function handleLogout() {
    if (confirm("هل تريد تسجيل الخروج؟")) {
        sessionStorage.clear();
        localStorage.removeItem("currentUser");
        if (window.api && window.api.appRelaunch) { window.api.appRelaunch(); }
        else { window.location.href = "login.html"; }
    }
}